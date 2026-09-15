// =============================================================================
// acq-dealflow — the member deal journey engine.
// Public: listings/detail teasers. Member (signed-in acq.members): apply,
// sign NDA (slot-capped), data room, Q&A, express interest, pass.
// Admin (org member / x-acq-secret): releases CRUD+publish, application queue,
// per-deal member-opportunity kanban, exclusivity, countersign, members CRUD,
// daily lifecycle (7-day warning, 30-day expiry).
// Doctrine: every transition timestamped + evented; declines always carry a
// reason; behaviour (doc opens, Q&A) logged next to declarations.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (x: string) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

const TIER_SLOTS: Record<string, number | null> = { circle: null, accelerator: 3, academy: 1 };
const LIVE_STATES = ['nda_signed', 'data_room', 'interest_expressed', 'intro_call_booked', 'offer_submitted', 'heads_of_terms', 'diligence'];
const PRE_OFFER = ['viewing', 'applied', 'approved', 'nda_pending', 'nda_signed', 'data_room', 'interest_expressed', 'intro_call_booked', 'waitlisted'];
const TEASER = 'r.id, r.headline, r.sector_group, r.region, r.turnover_band, r.ebitda_band, r.guide_multiple, r.ownership_score, r.score_breakdown, r.why_sourced, r.unlocks, r.image_key, r.nda_max, r.tier_windows, r.status, r.released_at, r.manual_review';

function wrapEmail(inner: string, brandName = 'Officially Invested', tpl?: string) {
  if (tpl && tpl.includes('{{CONTENT}}')) {
    const pre = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 130);
    return tpl.replace(/{{BRAND}}/g, esc(brandName)).replace(/{{PREHEADER}}/g, esc(pre)).replace('{{CONTENT}}', inner);
  }
  return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif"><div style="max-width:600px;margin:0 auto;padding:24px 14px"><div style="background:#0A2540;border-radius:14px 14px 0 0;padding:22px 28px"><div style="color:#FFD700;font-size:18px;font-weight:800">${esc(brandName)}</div></div><div style="background:#fff;border-radius:0 0 14px 14px;padding:24px 28px;font-size:14px;color:#26313c;line-height:1.6">${inner}</div></div></body></html>`;
}

function accessState(release: any, tier: string | null) {
  if (release.status === 'completed') return 'completed';
  if (release.status === 'withdrawn') return 'withdrawn';
  if (!tier) return 'join';
  if (release.status === 'under_offer') return 'waitlist';
  const windows = release.tier_windows ?? {};
  const days = Number(windows[tier] ?? (tier === 'academy' ? 7 : 0));
  if (!release.released_at) return 'locked';
  const opens = new Date(new Date(release.released_at).getTime() + days * 86400000);
  if (new Date() >= opens) return 'open';
  return `opens:${opens.toISOString().slice(0, 10)}`;
}

function computeScore(i: any) {
  const b: any[] = [];
  const age = Number(i.oldest_director_age ?? 0);
  const succ = age >= 70 ? 30 : age >= 65 ? 25 : age >= 60 ? 18 : age >= 55 ? 10 : 0;
  b.push({ part: 'Succession pressure', pts: succ, max: 30 });
  const rev = Number(i.revenue ?? 0), eb = Number(i.ebitda ?? 0);
  let fin = (rev >= 750000 && eb >= 180000) ? 15 : 0;
  const margin = rev > 0 ? eb / rev : 0;
  fin += margin >= 0.2 ? 10 : margin >= 0.12 ? 5 : 0;
  b.push({ part: 'Financial quality', pts: fin, max: 25 });
  const yrs = i.incorporated_on ? (Date.now() - new Date(i.incorporated_on).getTime()) / 3.156e10 : 0;
  let ten = yrs >= 15 ? 12 : yrs >= 8 ? 8 : yrs >= 3 ? 4 : 0;
  ten += i.adverse_filings ? 0 : 8;
  b.push({ part: 'Tenure & stability', pts: ten, max: 20 });
  const ready = (i.accounts_current ? 5 : 0) + (i.seller_engaged ? 10 : 0);
  b.push({ part: 'Deal readiness', pts: ready, max: 15 });
  const asset = i.asset_backing === 'full' ? 10 : i.asset_backing === 'partial' ? 5 : 0;
  b.push({ part: 'Asset backing', pts: asset, max: 10 });
  const total = succ + fin + ten + ready + asset;
  return { score: total, breakdown: b, band: total >= 80 ? 'Exceptional' : total >= 65 ? 'Strong' : total >= 50 ? 'Solid' : 'Speculative' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  const done = async (b: unknown, s = 200) => { await sql.end({ timeout: 5 }); return json(b, s); };
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? 'listings';
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','resend_api_key','from_email','email_template')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;

    // ---- identity: admin (org member) OR member (acq.members) OR anonymous
    let userId: string | null = null, userEmail: string | null = null;
    if (!trusted && req.headers.get('Authorization')) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
      const { data } = await sb.auth.getUser();
      if (data?.user) { userId = data.user.id; userEmail = data.user.email ?? null; }
    }
    // Deal flow lives in the HOST org's space (Officially Invested). SaaS users
    // from other workspaces become members here when their plan entitles them.
    const org = (await sql`select id, name, settings from acq.organizations order by created_at limit 1`)[0];
    if (!org) return done({ error: 'no org' }, 403);
    const orgId = org.id;
    let isAdmin = false; let userOrg: any = null;
    if (userId) {
      userOrg = (await sql`select o.id, o.settings->>'plan' as plan from acq.org_members m join acq.organizations o on o.id=m.org_id where m.user_id=${userId} order by m.created_at limit 1`)[0] ?? null;
      if (userOrg?.id === orgId) isAdmin = true;
    }
    const TIER_MAP: Record<string, string> = { analyst: 'academy', originator: 'accelerator', team: 'circle' };

    let member: any = null;
    if (userId && !isAdmin) {
      member = (await sql`select * from acq.members where user_id=${userId} limit 1`)[0] ?? null;
      if (!member && userEmail) {
        member = (await sql`update acq.members set user_id=${userId}, updated_at=now() where org_id=${orgId} and lower(email)=${userEmail.toLowerCase()} and user_id is null returning *`)[0] ?? null;
      }
      if (!member && userEmail && userOrg && TIER_MAP[userOrg.plan]) {
        member = (await sql`insert into acq.members (org_id, user_id, email, full_name, tier, status, notes)
          values (${orgId}, ${userId}, ${userEmail.toLowerCase()}, '', ${TIER_MAP[userOrg.plan]}, 'active', ${'auto: plan ' + userOrg.plan})
          on conflict (org_id, email) do update set user_id=coalesce(acq.members.user_id, excluded.user_id), tier=${TIER_MAP[userOrg.plan]}, status='active', updated_at=now() returning *`)[0] ?? null;
      }
      if (member?.status === 'suspended') member = null;
    }

    const mail = async (to: string, subject: string, inner: string) => {
      if (!cfg.resend_api_key) return;
      try { await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: org.settings?.outreach?.from || cfg.from_email, to: [to], subject, html: wrapEmail(inner, org.settings?.brand?.name || org.name, cfg.email_template) }) }); } catch (_) { /* best effort */ }
    };
    const adminEmails = async () => (await sql`select u.email from acq.org_members m join auth.users u on u.id=m.user_id where m.org_id=${orgId} and u.email is not null`).map((r: any) => r.email);
    const ev = (mdId: string, kind: string, detail: any = null) => sql`insert into acq.member_deal_events (org_id, member_deal_id, kind, detail) values (${orgId}, ${mdId}, ${kind}, ${detail})`;
    const setState = async (mdId: string, state: string, reason: string | null = null) => {
      await sql`update acq.member_deals set state=${state}, state_reason=${reason}, last_activity_at=now(), updated_at=now() where id=${mdId}`;
      await ev(mdId, 'state_change', { state, reason });
    };
    const touch = (mdId: string) => sql`update acq.member_deals set last_activity_at=now(), expiry_warned_at=null where id=${mdId}`;
    const ndaActive = async (releaseId: string) => Number((await sql`select count(*)::int as n from acq.member_deals where release_id=${releaseId} and nda_signed_at is not null and state = any(${LIVE_STATES})`)[0].n);
    const memberGate = () => done({ error: userId ? 'upgrade required' : 'membership required', needs_upgrade: !!userId && !isAdmin }, 403);

    // ============================ PUBLIC / MEMBER ============================
    if (action === 'me') {
      if (!member) return done({ member: null, is_admin: isAdmin, plan: userOrg?.plan ?? null, needs_upgrade: !!userId && !isAdmin });
      const mds = await sql`select md.*, r.headline, r.status as release_status from acq.member_deals md join acq.deal_releases r on r.id=md.release_id where md.member_id=${member.id} order by md.updated_at desc`;
      const slots = Number((await sql`select acq.member_active_slots(${member.id}) as n`)[0].n);
      return done({ member: { id: member.id, full_name: member.full_name, email: member.email, tier: member.tier }, deals: mds, slots_used: slots, slots_cap: TIER_SLOTS[member.tier] });
    }

    if (action === 'listings') {
      // TEASER is a static column list; values go through $n parameters, never string interpolation
      const rows = await sql.unsafe(`select ${TEASER} from acq.deal_releases r where r.org_id=$1 and r.status in ('released','under_offer','completed') and (r.status <> 'completed' or r.updated_at > now() - interval '30 days') order by r.released_at desc nulls last`, [orgId]);
      let states: Record<string, any> = {};
      if (member) for (const md of await sql`select release_id, state from acq.member_deals where member_id=${member.id}`) states[md.release_id] = md.state;
      return done({ listings: rows.map((r: any) => ({ ...r, access: accessState(r, member?.tier ?? null), my_state: states[r.id] ?? null })), tier: member?.tier ?? null, needs_upgrade: !!userId && !member && !isAdmin, plan: userOrg?.plan ?? null });
    }

    if (action === 'detail') {
      const releaseId = String(body.release_id ?? '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(releaseId)) return done({ error: 'not found' }, 404);
      const r = (await sql.unsafe(`select ${TEASER} from acq.deal_releases r where r.id=$1 and r.org_id=$2`, [releaseId, orgId]))[0];
      if (!r || r.status === 'draft') return done({ error: 'not found' }, 404);
      const active = await ndaActive(r.id);
      let md: any = null, qaPublished = 0;
      if (member) {
        md = (await sql`select * from acq.member_deals where member_id=${member.id} and release_id=${r.id}`)[0] ?? null;
        qaPublished = Number((await sql`select count(*)::int as n from acq.deal_qa where release_id=${r.id} and published`)[0].n);
      }
      return done({ release: r, ndas_active: active, access: accessState(r, member?.tier ?? null), my: md, qa_published: qaPublished, tier: member?.tier ?? null, needs_upgrade: !!userId && !member && !isAdmin, plan: userOrg?.plan ?? null });
    }

    if (action === 'apply') {
      if (!member) return memberGate();
      const r = (await sql`select * from acq.deal_releases where id=${body.release_id} and org_id=${orgId}`)[0];
      if (!r || r.status === 'draft' || r.status === 'withdrawn' || r.status === 'completed') return done({ error: 'deal not open' }, 400);
      const access = accessState(r, member.tier);
      if (access !== 'open' && access !== 'waitlist') return done({ error: `access not open for your tier (${access})` }, 403);
      if (!body.ack) return done({ error: 'NDA terms must be acknowledged' }, 400);
      const existing = (await sql`select state from acq.member_deals where member_id=${member.id} and release_id=${body.release_id}`)[0];
      if (existing && !['viewing', 'passed', 'declined', 'expired'].includes(existing.state)) return done({ error: `already ${existing.state.replace(/_/g, ' ')} on this deal` }, 400);
      const app = { buybox_confirm: !!body.application?.buybox_confirm, mismatch_reason: body.application?.mismatch_reason ?? null, motivation: String(body.application?.motivation ?? '').slice(0, 2000), ack: true };
      const readiness = ['cash_ready', 'finance_agreed', 'finance_not_arranged', 'exploring'].includes(body.application?.funding_readiness) ? body.application.funding_readiness : 'exploring';
      // routing
      let state = 'applied';
      if (access === 'waitlist') state = 'waitlisted';
      else if (member.tier === 'circle') state = 'nda_pending';
      else if (member.tier === 'accelerator' && !r.manual_review) state = 'nda_pending';
      const md = (await sql`insert into acq.member_deals (org_id, member_id, release_id, state, application, funding_readiness, buybox_match)
        values (${orgId}, ${member.id}, ${body.release_id}, ${state}, ${app}, ${readiness}, ${body.buybox_match ?? null})
        on conflict (member_id, release_id) do update set state=${state}, application=${app}, funding_readiness=${readiness}, last_activity_at=now(), updated_at=now()
        returning *`)[0];
      await ev(md.id, 'state_change', { state, via: 'apply' });
      if (state === 'applied') {
        for (const a of await adminEmails()) await mail(a, `Deal application · ${r.headline} · ${member.full_name}`, `<p><b>${esc(member.full_name)}</b> (${member.tier}) applied for <b>${esc(r.headline)}</b>.</p><p>Funding readiness: <b>${readiness.replace(/_/g, ' ')}</b></p><p>Motivation: ${esc(app.motivation)}</p><p>Review in the admin queue — 24h SLA.</p>`);
        await mail(member.email, `Application received · ${r.headline}`, `<p>Thanks ${esc(member.full_name.split(' ')[0])} — your application for <b>${esc(r.headline)}</b> is with us. We review within 24 hours and you'll get a decision either way.</p>`);
      }
      if (state === 'waitlisted') await mail(member.email, `Waitlisted · ${r.headline}`, `<p>This deal is currently under offer with another member. You're on the waitlist — if it reopens you'll be first to know, in join order. No slot is consumed while you wait.</p>`);
      return done({ ok: true, member_deal: md, next: state === 'nda_pending' ? 'sign_nda' : state });
    }

    if (action === 'sign_nda') {
      if (!member) return memberGate();
      const md = (await sql`select md.*, r.headline, r.nda_max, r.nda_version, r.countersign_mode from acq.member_deals md join acq.deal_releases r on r.id=md.release_id where md.member_id=${member.id} and md.release_id=${body.release_id}`)[0];
      if (!md || md.state !== 'nda_pending') return done({ error: 'not approved for NDA yet' }, 400);
      if (!body.typed_name || !body.agree) return done({ error: 'typed name and agreement required' }, 400);
      const cap = TIER_SLOTS[member.tier];
      if (cap !== null) {
        const used = Number((await sql`select acq.member_active_slots(${member.id}) as n`)[0].n);
        if (used >= cap) return done({ error: `NDA slot limit reached for your tier (${used}/${cap}). Pass on a live deal to free a slot.` }, 400);
      }
      if ((await ndaActive(md.release_id)) >= md.nda_max) return done({ error: 'This deal has reached its NDA limit. Join the notify list — slots free up when members pass.' }, 400);
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      const auto = md.countersign_mode === 'auto';
      await sql`insert into acq.ndas (org_id, member_deal_id, nda_version, typed_name, ip, user_agent, countersigned_at, countersigned_by) values (${orgId}, ${md.id}, ${md.nda_version}, ${String(body.typed_name).slice(0, 120)}, ${ip}, ${req.headers.get('user-agent')?.slice(0, 300) ?? null}, ${auto ? new Date() : null}, ${auto ? 'auto' : null})`;
      await sql`update acq.member_deals set nda_signed_at=now(), last_activity_at=now(), updated_at=now() where id=${md.id}`;
      await setState(md.id, auto ? 'data_room' : 'nda_signed');
      await mail(member.email, `NDA confirmed · ${md.headline}`, auto
        ? `<p>Your NDA on <b>${esc(md.headline)}</b> is signed and countersigned. The data room is open now — business identity, three years of accounts, the IM and deal notes are waiting, and you can ask questions directly.</p>`
        : `<p>Your NDA on <b>${esc(md.headline)}</b> is signed. It's awaiting countersignature — you'll get data-room access the moment it's countersigned.</p>`);
      return done({ ok: true, state: auto ? 'data_room' : 'nda_signed' });
    }

    if (action === 'data_room') {
      if (!member) return memberGate();
      const md = (await sql`select * from acq.member_deals where member_id=${member.id} and release_id=${body.release_id}`)[0];
      if (!md || !LIVE_STATES.includes(md.state) || md.state === 'nda_signed') return done({ error: 'data room locked' }, 403);
      const r = (await sql`select * from acq.deal_releases where id=${md.release_id}`)[0];
      const deal = r.deal_id ? (await sql`select to_jsonb(d) as d from acq.deals d where d.id=${r.deal_id}`)[0]?.d ?? null : null;
      const sub = r.submission_id ? (await sql`select business_name, region, locations, sector, revenue, net_profit, asking_price, description, reference from public.submissions where id=${r.submission_id}`)[0] ?? null : null;
      let docs: any[] = [];
      try { docs = await sql`select id, file_name as name, doc_kind, uploaded_at as created_at from acq.documents where deal_id=${r.deal_id} order by uploaded_at desc`; } catch (_) { docs = []; }
      const qa = await sql`select id, question, answer, published, created_at, answered_at, (member_deal_id=${md.id}) as mine from acq.deal_qa where release_id=${r.id} and (published or member_deal_id=${md.id}) order by created_at desc limit 100`;
      await touch(md.id);
      await ev(md.id, 'doc_open', { what: 'data_room' });
      return done({
        ok: true, state: md.state,
        identity: { business_name: sub?.business_name ?? deal?.name ?? null, location: sub?.locations ?? sub?.region ?? null, reference: sub?.reference ?? null },
        financials: sub ? { revenue: sub.revenue, profit: sub.net_profit, asking_price: sub.asking_price } : null,
        description: sub?.description ?? null, deal_notes: deal?.notes ?? null, evidence: deal?.evidence ?? null,
        documents: docs, qa,
        watermark: `${member.full_name} · ${member.email} · ${sub?.reference ?? r.id.slice(0, 8)}`,
        calendly: (org.settings?.dealflow?.booking_url ?? org.settings?.dealflow?.calendly_url) ?? null,
      });
    }

    if (action === 'log_open') {
      if (!member) return memberGate();
      const md = (await sql`select id from acq.member_deals where member_id=${member.id} and release_id=${body.release_id}`)[0];
      if (md) { await ev(md.id, body.kind === 'download' ? 'doc_download' : 'doc_open', { document_id: body.document_id ?? null, name: body.name ?? null }); await touch(md.id); }
      return done({ ok: true });
    }

    if (action === 'ask') {
      if (!member) return memberGate();
      const md = (await sql`select id, state from acq.member_deals where member_id=${member.id} and release_id=${body.release_id}`)[0];
      if (!md || !LIVE_STATES.includes(md.state)) return done({ error: 'Q&A is for NDA-signed members' }, 403);
      const q = (await sql`insert into acq.deal_qa (org_id, release_id, member_deal_id, question) values (${orgId}, ${body.release_id}, ${md.id}, ${String(body.question).slice(0, 2000)}) returning *`)[0];
      await ev(md.id, 'qa_question', { qa_id: q.id }); await touch(md.id);
      for (const a of await adminEmails()) await mail(a, `Deal Q&A · new question`, `<p>New question from <b>${esc(member.full_name)}</b>:</p><p>"${esc(q.question)}"</p><p>Answer it from the deal's member board.</p>`);
      return done({ ok: true, qa: q });
    }

    if (action === 'express_interest') {
      if (!member) return memberGate();
      const md = (await sql`select md.*, r.headline from acq.member_deals md join acq.deal_releases r on r.id=md.release_id where md.member_id=${member.id} and md.release_id=${body.release_id}`)[0];
      if (!md || md.state !== 'data_room') return done({ error: 'open the data room first' }, 400);
      await setState(md.id, 'interest_expressed');
      for (const a of await adminEmails()) await mail(a, `Interest expressed · ${md.headline}`, `<p><b>${esc(member.full_name)}</b> (${member.tier}, ${String(md.funding_readiness).replace(/_/g, ' ')}) has expressed interest in <b>${esc(md.headline)}</b>. They're booking an intro call — the member board has their full activity log.</p>`);
      return done({ ok: true, calendly: (org.settings?.dealflow?.booking_url ?? org.settings?.dealflow?.calendly_url) ?? null });
    }

    if (action === 'book_confirm') {
      if (!member) return memberGate();
      const md = (await sql`select id, state from acq.member_deals where member_id=${member.id} and release_id=${body.release_id}`)[0];
      if (md?.state === 'interest_expressed') await setState(md.id, 'intro_call_booked');
      return done({ ok: true });
    }

    if (action === 'pass') {
      if (!member) return memberGate();
      const md = (await sql`select md.*, r.headline from acq.member_deals md join acq.deal_releases r on r.id=md.release_id where md.member_id=${member.id} and md.release_id=${body.release_id}`)[0];
      if (!md || !PRE_OFFER.includes(md.state)) return done({ error: 'cannot pass at this stage' }, 400);
      const reason = ['price', 'sector', 'location', 'timing', 'other'].includes(body.reason) ? body.reason : 'other';
      await setState(md.id, 'passed', body.feedback ? `${reason}: ${String(body.feedback).slice(0, 500)}` : reason);
      return done({ ok: true, slot_freed: !!md.nda_signed_at });
    }

    // ================================ ADMIN =================================
    if (!isAdmin && !trusted) return done({ error: 'unauthorised' }, 401);

    if (action === 'score') return done({ ok: true, ...computeScore(body.inputs ?? {}) });

    if (action === 'admin_members') {
      const rows = await sql`select m.*, acq.member_active_slots(m.id) as slots_used,
        (select count(*)::int from acq.member_deals md where md.member_id=m.id) as deal_count
        from acq.members m where m.org_id=${orgId} order by m.created_at desc`;
      return done({ ok: true, members: rows });
    }
    if (action === 'admin_member_upsert') {
      const m = body.member ?? {};
      if (m.id) {
        const row = (await sql`update acq.members set full_name=${m.full_name ?? ''}, tier=${m.tier ?? 'academy'}, status=${m.status ?? 'active'}, notes=${m.notes ?? null}, updated_at=now() where id=${m.id} and org_id=${orgId} returning *`)[0];
        return done({ ok: true, member: row });
      }
      const row = (await sql`insert into acq.members (org_id, email, full_name, tier, notes) values (${orgId}, ${String(m.email).toLowerCase().trim()}, ${m.full_name ?? ''}, ${m.tier ?? 'academy'}, ${m.notes ?? null}) on conflict (org_id, email) do update set full_name=excluded.full_name, tier=excluded.tier, updated_at=now() returning *`)[0];
      return done({ ok: true, member: row });
    }

    if (action === 'admin_release_upsert') {
      const r = body.release ?? {};
      const auto = body.score_inputs ? computeScore(body.score_inputs) : null;
      const score = r.ownership_score ?? auto?.score ?? null;
      const breakdown = auto ? auto.breakdown : (r.score_breakdown ?? null);
      if (r.id) {
        const row = (await sql`update acq.deal_releases set headline=${r.headline}, sector_group=${r.sector_group ?? null}, region=${r.region ?? null}, turnover_band=${r.turnover_band ?? null}, ebitda_band=${r.ebitda_band ?? null}, guide_multiple=${r.guide_multiple ?? null}, ownership_score=${score}, score_breakdown=${breakdown}, why_sourced=${r.why_sourced ?? ''}, unlocks=${r.unlocks ?? null}, image_key=${r.image_key ?? null}, nda_max=${r.nda_max ?? 10}, countersign_mode=${r.countersign_mode ?? 'auto'}, manual_review=${r.manual_review ?? false}, tier_windows=${r.tier_windows ?? null}, updated_at=now() where id=${r.id} and org_id=${orgId} returning *`)[0];
        return done({ ok: true, release: row });
      }
      const row = (await sql`insert into acq.deal_releases (org_id, deal_id, submission_id, headline, sector_group, region, turnover_band, ebitda_band, guide_multiple, ownership_score, score_breakdown, why_sourced, unlocks, image_key, nda_max, countersign_mode, manual_review, tier_windows)
        values (${orgId}, ${r.deal_id ?? null}, ${r.submission_id ?? null}, ${r.headline}, ${r.sector_group ?? null}, ${r.region ?? null}, ${r.turnover_band ?? null}, ${r.ebitda_band ?? null}, ${r.guide_multiple ?? null}, ${score}, ${breakdown}, ${r.why_sourced ?? ''}, ${r.unlocks ?? ['Name & location', '3 years accounts', 'Information memorandum', 'Deal notes', 'Q&A access']}, ${r.image_key ?? null}, ${r.nda_max ?? 10}, ${r.countersign_mode ?? 'auto'}, ${r.manual_review ?? false}, ${r.tier_windows ?? { circle: 0, accelerator: 0, academy: 7 }})
        on conflict (org_id, deal_id) do update set headline=excluded.headline, why_sourced=excluded.why_sourced, updated_at=now() returning *`)[0];
      return done({ ok: true, release: row });
    }

    if (action === 'admin_release_publish') {
      const r = (await sql`update acq.deal_releases set status='released', released_at=coalesce(released_at, now()), updated_at=now() where id=${body.release_id} and org_id=${orgId} returning *`)[0];
      if (!r) return done({ error: 'not found' }, 404);
      const windows = r.tier_windows ?? {};
      const day0 = ['circle', 'accelerator', 'academy'].filter((t) => Number(windows[t] ?? (t === 'academy' ? 7 : 0)) === 0);
      const members = day0.length ? await sql`select email, full_name, tier from acq.members where org_id=${orgId} and status='active' and tier = any(${day0})` : [];
      for (const m of members) await mail(m.email, `New deal released · ${r.headline}`, `<p>A new deal is live for your tier:</p><p><b>${esc(r.headline)}</b><br/>${esc(r.region ?? '')} · turnover ${esc(r.turnover_band ?? '—')} · adj EBITDA ${esc(r.ebitda_band ?? '—')} · Ownership Score ${r.ownership_score ?? '—'}</p><p><i>"${esc(r.why_sourced)}"</i> — Sandeep</p><p><a href="https://www.officiallyinvested.com/deals/${r.id}" style="display:inline-block;background:#FFD700;color:#0A2540;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none">View the deal</a></p>`);
      return done({ ok: true, release: r, notified: members.length });
    }

    if (action === 'admin_releases') {
      const rows = await sql`select r.*,
        (select count(*)::int from acq.member_deals md where md.release_id=r.id and md.state<>'viewing') as n_applied,
        (select count(*)::int from acq.member_deals md where md.release_id=r.id and md.nda_signed_at is not null) as n_nda,
        (select count(*)::int from acq.member_deals md where md.release_id=r.id and md.state in ('interest_expressed','intro_call_booked','offer_submitted','heads_of_terms','diligence')) as n_interested,
        (select count(*)::int from acq.member_deals md where md.release_id=r.id and md.state='applied') as n_queue,
        (select min(case funding_readiness when 'cash_ready' then 1 when 'finance_agreed' then 2 when 'finance_not_arranged' then 3 else 4 end) from acq.member_deals md where md.release_id=r.id and md.state = any(${LIVE_STATES})) as hottest_readiness
        from acq.deal_releases r where r.org_id=${orgId} order by r.created_at desc`;
      return done({ ok: true, releases: rows });
    }

    if (action === 'admin_board') {
      const rows = await sql`select md.*, m.full_name, m.email, m.tier,
        (select count(*)::int from acq.member_deal_events e where e.member_deal_id=md.id and e.kind in ('doc_open','doc_download')) as doc_activity,
        (select count(*)::int from acq.deal_qa q where q.member_deal_id=md.id) as questions
        from acq.member_deals md join acq.members m on m.id=md.member_id
        where md.release_id=${body.release_id} and md.org_id=${orgId} order by md.updated_at desc`;
      const events = body.member_deal_id ? await sql`select kind, detail, created_at from acq.member_deal_events where member_deal_id=${body.member_deal_id} order by created_at desc limit 100` : [];
      const qa = await sql`select q.*, m.full_name from acq.deal_qa q left join acq.member_deals md on md.id=q.member_deal_id left join acq.members m on m.id=md.member_id where q.release_id=${body.release_id} order by q.created_at desc`;
      return done({ ok: true, opportunities: rows, events, qa });
    }

    if (action === 'admin_decide') {
      const md = (await sql`select md.*, m.email, m.full_name, r.headline from acq.member_deals md join acq.members m on m.id=md.member_id join acq.deal_releases r on r.id=md.release_id where md.id=${body.member_deal_id} and md.org_id=${orgId}`)[0];
      if (!md || md.state !== 'applied') return done({ error: 'not in queue' }, 400);
      if (body.decision === 'approve') {
        await setState(md.id, 'nda_pending');
        await mail(md.email, `Approved · ${md.headline}`, `<p>Good news ${esc(md.full_name.split(' ')[0])} — your application for <b>${esc(md.headline)}</b> is approved. Sign the NDA to open the data room.</p><p><a href="https://www.officiallyinvested.com/deals/${md.release_id}" style="display:inline-block;background:#FFD700;color:#0A2540;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none">Sign NDA</a></p>`);
      } else {
        const reason = body.reason || 'deal oversubscribed';
        await setState(md.id, 'declined', reason);
        await mail(md.email, `Application update · ${md.headline}`, `<p>Thanks for applying for <b>${esc(md.headline)}</b>. On this one it's a no: <b>${esc(reason)}</b>.</p><p>This doesn't affect future applications — the next deal in your buy box could be days away.</p>`);
      }
      return done({ ok: true });
    }

    if (action === 'admin_advance') {
      const allowed = ['interest_expressed', 'intro_call_booked', 'offer_submitted', 'heads_of_terms', 'diligence', 'completed', 'declined', 'revoked'];
      if (!allowed.includes(body.state)) return done({ error: 'invalid state' }, 400);
      const md = (await sql`select md.*, m.email, m.full_name, r.headline, r.id as rid from acq.member_deals md join acq.members m on m.id=md.member_id join acq.deal_releases r on r.id=md.release_id where md.id=${body.member_deal_id} and md.org_id=${orgId}`)[0];
      if (!md) return done({ error: 'not found' }, 404);
      await setState(md.id, body.state, body.reason ?? null);
      if (body.state === 'completed') await sql`update acq.deal_releases set status='completed', updated_at=now() where id=${md.rid}`;
      return done({ ok: true });
    }

    if (action === 'admin_exclusivity') {
      const md = (await sql`select md.*, r.headline, r.id as rid from acq.member_deals md join acq.deal_releases r on r.id=md.release_id where md.id=${body.member_deal_id} and md.org_id=${orgId}`)[0];
      if (!md) return done({ error: 'not found' }, 404);
      await sql`update acq.member_deals set exclusivity=true, updated_at=now() where id=${md.id}`;
      await sql`update acq.deal_releases set status='under_offer', updated_at=now() where id=${md.rid}`;
      const others = await sql`select md.id, m.email, m.full_name from acq.member_deals md join acq.members m on m.id=md.member_id where md.release_id=${md.rid} and md.id<>${md.id} and md.state = any(${LIVE_STATES.concat(['applied', 'nda_pending'])})`;
      for (const o of others) {
        await setState(o.id, 'waitlisted', 'exclusivity granted to another member');
        await mail(o.email, `Deal update · ${md.headline}`, `<p>Straight answer: another member has been granted exclusivity on <b>${esc(md.headline)}</b>. Deals fall over more often than people admit — you're on the waitlist in order, and your NDA slot is freed in the meantime.</p>`);
      }
      return done({ ok: true, waitlisted: others.length });
    }

    if (action === 'admin_answer') {
      const q = (await sql`update acq.deal_qa set answer=${String(body.answer).slice(0, 4000)}, published=${!!body.published}, answered_at=now() where id=${body.qa_id} and org_id=${orgId} returning *`)[0];
      if (!q) return done({ error: 'not found' }, 404);
      const asker = (await sql`select m.email, m.full_name, r.headline from acq.member_deals md join acq.members m on m.id=md.member_id join acq.deal_releases r on r.id=md.release_id where md.id=${q.member_deal_id}`)[0];
      if (asker) await mail(asker.email, `Your question answered · ${asker.headline}`, `<p><b>Q:</b> ${esc(q.question)}</p><p><b>A:</b> ${esc(q.answer)}</p>`);
      return done({ ok: true, qa: q });
    }

    if (action === 'admin_countersign') {
      const md = (await sql`select md.*, m.email, r.headline from acq.member_deals md join acq.members m on m.id=md.member_id join acq.deal_releases r on r.id=md.release_id where md.id=${body.member_deal_id} and md.org_id=${orgId}`)[0];
      if (!md || md.state !== 'nda_signed') return done({ error: 'nothing to countersign' }, 400);
      await sql`update acq.ndas set countersigned_at=now(), countersigned_by=${userEmail ?? 'admin'} where member_deal_id=${md.id} and countersigned_at is null`;
      await setState(md.id, 'data_room');
      await mail(md.email, `Data room open · ${md.headline}`, `<p>Your NDA on <b>${esc(md.headline)}</b> is countersigned — the data room is open now.</p>`);
      return done({ ok: true });
    }

    if (action === 'run_daily') {
      if (!trusted) return done({ error: 'unauthorised' }, 401);
      // 7-day warning at 23 days idle, expire at 30
      const toWarn = await sql`select md.id, m.email, m.full_name, r.headline from acq.member_deals md join acq.members m on m.id=md.member_id join acq.deal_releases r on r.id=md.release_id where md.state in ('nda_signed','data_room') and md.last_activity_at < now() - interval '23 days' and md.expiry_warned_at is null`;
      for (const w of toWarn) {
        await sql`update acq.member_deals set expiry_warned_at=now() where id=${w.id}`;
        await mail(w.email, `Your access expires in 7 days · ${w.headline}`, `<p>You've been quiet on <b>${esc(w.headline)}</b> for a while. Data-room access (and the NDA slot it holds) expires after 30 days of inactivity — 7 days from now. Open the data room, ask a question, or pass to free the slot deliberately.</p>`);
      }
      const toExpire = await sql`select md.id, m.email, r.headline from acq.member_deals md join acq.members m on m.id=md.member_id join acq.deal_releases r on r.id=md.release_id where md.state in ('nda_signed','data_room') and md.last_activity_at < now() - interval '30 days'`;
      for (const e of toExpire) {
        await setState(e.id, 'expired', '30 days inactivity');
        await mail(e.email, `Access expired · ${e.headline}`, `<p>Your data-room access on <b>${esc(e.headline)}</b> has expired after 30 days of inactivity. Your NDA obligations continue; your slot is freed. If you're still interested, re-apply any time.</p>`);
      }
      return done({ ok: true, warned: toWarn.length, expired: toExpire.length });
    }

    return done({ error: `unknown action ${action}` }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* noop */ }
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
