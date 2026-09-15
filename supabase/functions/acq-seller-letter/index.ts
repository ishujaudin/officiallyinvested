// =============================================================================
// acq-seller-letter — a personal welcome letter for sellers who come to us.
// -----------------------------------------------------------------------------
// A seller submits their business through /submit-opportunity, which lands in
// public.submissions. This function turns that submission into a prospect with
// a resolved POSTAL address, asks Claude for a letter written for that seller
// in the firm's voice, and places it in the existing outreach approval queue
// (acq.outreach_touches, status needs_approval). Nothing is posted until it is
// approved in Origination -> Campaigns; the outreach engine then sends it via
// Stannp exactly like any other letter (test/live follows settings.outreach.letters_live).
//
//   action 'run' (cron, x-acq-secret)   every qualifying submission with no letter yet
//   action 'one' ({ submission_id })     a single submission (admin button / retry)
//
// Address resolution, in order:
//   1. submissions.postal_address + postal_postcode (optional columns, if present)
//   2. business sellers: Companies House registered office, via the company
//      number they typed into the form
//   3. neither -> a task is raised for a human to add the address; no letter yet
//
// org settings (acq.organizations.settings.outreach.seller_letters):
//   { enabled: true, eligible_only: true, auto: false }
//   eligible_only -> skip submissions the intake gate marked 'ineligible'
//   auto          -> queue as 'approved' instead of 'needs_approval'
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const CH = 'https://api.company-information.service.gov.uk';
const CAMPAIGN_NAME = 'Inbound seller welcome letter';
// submissions created by our own tooling rather than by a seller
const INTERNAL_SOURCES = ['origination', 'drive'];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const clean = (s: string) => s.replace(/—/g, ', ').replace(/\*\*|##+|```/g, '').trim();
const firstName = (full: string | null | undefined) => (String(full ?? '').trim().split(/\s+/)[0] || 'there');

// ---- address ----------------------------------------------------------------

interface Address { address: string; postcode: string; company?: string | null }

/** Companies House registered office for the number the seller entered */
async function chAddress(key: string, number: string): Promise<Address | null> {
  if (!key || !number) return null;
  try {
    const r = await fetch(`${CH}/company/${encodeURIComponent(number.trim().toUpperCase())}`, { headers: { Authorization: 'Basic ' + btoa(key + ':') } });
    if (!r.ok) return null;
    const c = await r.json();
    const a = c?.registered_office_address ?? {};
    const lines = [a.address_line_1, a.address_line_2, a.locality, a.region].map((x: unknown) => String(x ?? '').trim()).filter(Boolean);
    if (!lines.length || !a.postal_code) return null;
    return { address: lines.join(', '), postcode: String(a.postal_code).trim(), company: c?.company_name ?? null };
  } catch { return null; }
}

/** address typed on the form, if those optional columns exist and were filled */
function formAddress(s: any): Address | null {
  const address = String(s?.postal_address ?? '').trim();
  const postcode = String(s?.postal_postcode ?? '').trim();
  return address && postcode ? { address, postcode } : null;
}

// ---- letter -----------------------------------------------------------------

const FALLBACK_LETTER = `Dear {{first_name}},

Thank you for telling us about {{company_name}}. We read every submission personally, and yours is now with our team.

Here is what happens next. We will review what you have shared within five working days. If it looks like a fit, we will suggest a short confidential call, at a time that suits you, to understand the business and what a good outcome looks like for you.

Everything you have sent stays confidential. We buy established businesses with the intention of keeping the people, the customers and the name that built them, so the questions we ask are about the business as it really runs, not about squeezing a price.

If anything changes, or you would simply like to talk sooner, reply to this letter or get in touch using the details below.

With thanks,
{{sender_name}}
{{sender_company}}`;

function renderFallback(s: any, sender: string, company: string, orgName: string) {
  return FALLBACK_LETTER
    .replace(/{{first_name}}/g, firstName(s.submitter_name))
    .replace(/{{company_name}}/g, company)
    .replace(/{{sender_name}}/g, sender)
    .replace(/{{sender_company}}/g, orgName);
}

async function draftLetter(cfg: any, org: any, s: any, company: string, sender: string): Promise<string> {
  const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
  const fallback = renderFallback(s, sender, company, org.name);
  if (!ANTHROPIC) return fallback;
  const profile = org?.settings?.profile ?? null;
  const system =
    `You write a short personal welcome letter from ${sender} at ${org.name} to a business owner who has just submitted their business to us as a potential sale through our website. ` +
    'This is a PRINTED LETTER delivered by post, not an email: never call it an email or mention replying to an email; invite them to call or write back, and note our contact details are printed at the foot of the page. ' +
    'Voice: warm, plain, human, confident, discreet. Short sentences. UK English. No hype, no jargon, no em-dashes, no markdown, no bullet points, no AI tells. ' +
    'Show you read what they sent by referring naturally to one or two specifics (their sector, region, how long they have been going, their reason for selling). ' +
    'Never print their financial figures back to them; say "the figures you shared". Never promise a price, a valuation or a timeline. ' +
    'Cover: thanks; what happens next (we review within five working days, then suggest a short confidential call); confidentiality; that we keep the people, customers and name that built the business; an easy invitation to reply or call. ' +
    (cfg.drafting_rules ? 'House rules: ' + String(cfg.drafting_rules).slice(0, 1500) + ' ' : '') +
    (profile ? 'About the buyer (weave in at most one specific, never brag): ' + JSON.stringify(profile).slice(0, 700) : '');
  const facts = {
    seller_first_name: firstName(s.submitter_name), seller_role: s.submitter_role, business_name: company, type: s.type,
    sector: s.sector, region: s.region ?? s.locations, year_established: s.year_established, employees: s.employees,
    reason_for_sale: s.reason_for_sale, handover_willing: s.handover_willing, handover_period: s.handover_period,
    open_to_deferred: s.open_to_deferred, description: String(s.description ?? '').slice(0, 800),
    intake_outcome: s.status === 'ineligible' ? 'below our usual size thresholds - still be gracious and leave the door open' : 'within our criteria',
  };
  try {
    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1200, system,
        tools: [{ name: 'set_letter', description: 'Return the letter', input_schema: { type: 'object', properties: { letter_body: { type: 'string', description: '200-280 words, letter layout: starts "Dear <first name>," ends with a sign-off and the sender name. Plain text.' } }, required: ['letter_body'] } }],
        tool_choice: { type: 'tool', name: 'set_letter' },
        messages: [{ role: 'user', content: 'Write the welcome letter for this seller:\n' + JSON.stringify(facts) }],
      }),
    });
    if (!ar.ok) { console.error('seller-letter anthropic', ar.status, (await ar.text()).slice(0, 200)); return fallback; }
    const out: any = ((await ar.json()).content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? {};
    const body = clean(String(out.letter_body ?? ''));
    return body.length > 200 ? body : fallback;
  } catch (e) { console.error('seller-letter draft', e); return fallback; }
}

// ---- queue plumbing ---------------------------------------------------------

async function ensureCampaign(sql: any, orgId: string) {
  let c = (await sql`select * from acq.campaigns where org_id=${orgId} and name=${CAMPAIGN_NAME} order by created_at limit 1`)[0];
  if (!c) c = (await sql`insert into acq.campaigns (org_id, name, target_filter, approval_mode, daily_cap, status) values (${orgId}, ${CAMPAIGN_NAME}, ${{ kind: 'inbound_seller' }}, 'manual', 25, 'active') returning *`)[0];
  else if (c.status !== 'active') await sql`update acq.campaigns set status='active' where id=${c.id}`;
  let step = (await sql`select * from acq.campaign_steps where campaign_id=${c.id} order by position limit 1`)[0];
  if (!step) step = (await sql`insert into acq.campaign_steps (campaign_id, position, channel, wait_days, subject, body) values (${c.id}, 0, 'letter', 0, null, ${FALLBACK_LETTER}) returning *`)[0];
  return { campaign: c, step };
}

async function isSuppressed(sql: any, orgId: string, email: string | null, companyNumber: string | null): Promise<string | null> {
  const vals: { kind: string; value: string }[] = [];
  if (email) { vals.push({ kind: 'email', value: email.toLowerCase() }); if (email.includes('@')) vals.push({ kind: 'domain', value: email.split('@')[1].toLowerCase() }); }
  if (companyNumber) vals.push({ kind: 'company_number', value: companyNumber });
  for (const v of vals) {
    const hit = (await sql`select reason from acq.suppressions where (org_id=${orgId} or reason='opt_out') and kind=${v.kind} and value=${v.value} limit 1`)[0];
    if (hit) return hit.reason ?? 'suppressed';
  }
  return null;
}

async function ensureTask(sql: any, orgId: string, title: string) {
  const dup = (await sql`select id from acq.tasks where org_id=${orgId} and title=${title} and status='open' limit 1`)[0];
  if (!dup) await sql`insert into acq.tasks (org_id, title, due_date) values (${orgId}, ${title}, ${new Date().toISOString().slice(0, 10)})`;
}

async function processOne(sql: any, cfg: any, org: any, campaign: any, step: any, s: any, prefs: any) {
  const orgId = org.id;
  const ref = s.reference ?? s.id;
  const company = s.business_name || s.spv_name || s.firm_name || `${s.submitter_name}'s business`;

  // 1) already has a prospect + letter? (matched on the submission id we stamp
  //    into source; provenance stays 'funnel' - the value the platform already
  //    uses for inbound seller enquiries and that the prospects check constraint allows)
  let p = (await sql`select * from acq.prospects where org_id=${orgId} and source->>'submission_id'=${s.id} limit 1`)[0];
  if (p) {
    // a cancelled letter doesn't count - cancelling in the queue and re-running is how you get a fresh draft
    const t = (await sql`select id, status from acq.outreach_touches where prospect_id=${p.id} and campaign_id=${campaign.id} and status <> 'cancelled' order by created_at desc limit 1`)[0];
    if (t) return { submission_id: s.id, reference: ref, outcome: 'exists', touch_status: t.status };
  }

  // 2) postal address
  let addr = formAddress(s);
  if (!addr && s.type === 'business' && s.companies_house_number) addr = await chAddress(Deno.env.get('COMPANIES_HOUSE_API_KEY') || cfg.ch_api_key || '', s.companies_house_number);
  if (!addr && p?.address && p?.postcode) addr = { address: p.address, postcode: p.postcode };
  if (!addr) {
    await ensureTask(sql, orgId, `Seller letter needs a postal address: ${company} (${ref}) - add it to the prospect, the letter will queue on the next run`);
    return { submission_id: s.id, reference: ref, outcome: 'needs_address' };
  }

  // 3) prospect row the outreach engine can post to
  if (!p) {
    p = (await sql`insert into acq.prospects (org_id, company_name, company_number, owner_name, owner_email, owner_phone, region, address, postcode, provenance, exportable, source, stage, notes)
      values (${orgId}, ${addr.company ?? company}, ${s.companies_house_number ?? null}, ${s.owner_name || s.submitter_name}, ${s.email ?? null}, ${s.phone ?? null}, ${s.region ?? s.locations ?? null},
              ${addr.address}, ${addr.postcode}, 'funnel', false, ${{ kind: 'submission', submission_id: s.id, reference: ref }}, 'qualified',
              ${'Inbound seller submission ' + ref + (s.reason_for_sale ? '. Reason for sale: ' + String(s.reason_for_sale).slice(0, 300) : '')}) returning *`)[0];
  } else if (!p.address || !p.postcode) {
    await sql`update acq.prospects set address=${addr.address}, postcode=${addr.postcode}, updated_at=now() where id=${p.id}`;
  }

  // 4) opt-outs are honoured platform-wide
  const supp = await isSuppressed(sql, orgId, s.email ?? null, s.companies_house_number ?? null);
  if (supp) return { submission_id: s.id, reference: ref, outcome: 'suppressed', reason: supp };

  // 5) the letter itself, then into the approval queue
  const sender = org?.settings?.outreach?.sender_name || org.name;
  const body = await draftLetter(cfg, org, s, company, sender);
  const status = prefs.auto ? 'approved' : 'needs_approval';
  const t = (await sql`insert into acq.outreach_touches (org_id, prospect_id, campaign_id, step_id, channel, status, subject, body) values (${orgId}, ${p.id}, ${campaign.id}, ${step.id}, 'letter', ${status}, null, ${body}) returning id`)[0];
  return { submission_id: s.id, reference: ref, outcome: 'queued', touch_id: t.id, touch_status: status };
}

// ---- handler ----------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  const done = async (b: unknown, s = 200) => { await sql.end({ timeout: 5 }); return json(b, s); };
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? 'run';
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','anthropic_api_key','ch_api_key','drafting_rules')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;

    // Inbound submissions belong to the host org (the oldest organization).
    const org = (await sql`select id, name, settings from acq.organizations order by created_at limit 1`)[0];
    if (!org) return done({ error: 'no org' }, 403);
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) return done({ error: 'unauthorised' }, 401);
      const m = (await sql`select 1 from acq.org_members where org_id=${org.id} and user_id=${data.user.id} and role in ('owner','admin','analyst')`)[0];
      if (!m) return done({ error: 'forbidden' }, 403);
    }

    // `since`: only sellers who arrived after the feature went live get a letter -
    // older submissions were handled by hand and shouldn't flood the queue.
    const prefs = { enabled: true, eligible_only: true, auto: false, since: '2026-09-15', ...(org.settings?.outreach?.seller_letters ?? {}) };
    if (!prefs.enabled && action === 'run') return done({ ok: true, skipped: 'seller letters disabled in settings' });

    let subs: any[];
    if (action === 'one') {
      if (!body.submission_id) return done({ error: 'submission_id required' }, 400);
      subs = await sql`select * from public.submissions where id=${body.submission_id} limit 1`;
      if (!subs.length) return done({ error: 'submission not found' }, 404);
    } else if (action === 'run') {
      subs = await sql`
        select * from public.submissions
        where created_at > now() - interval '30 days'
          and created_at >= ${prefs.since}::timestamptz
          and consent = true
          and coalesce(heard_via, '') <> all(${INTERNAL_SOURCES})
          and status <> 'passed'
          ${prefs.eligible_only ? sql`and status <> 'ineligible'` : sql``}
        order by created_at asc limit 10`;   // ~10s of Claude per letter; the cron runs every 30 min
    } else {
      return done({ error: 'unknown action' }, 400);
    }

    const { campaign, step } = await ensureCampaign(sql, org.id);
    const results: any[] = [];
    for (const s of subs) {
      try { results.push(await processOne(sql, cfg, org, campaign, step, s, prefs)); }
      catch (e) { results.push({ submission_id: s.id, reference: s.reference, outcome: 'error', error: String(e).slice(0, 200) }); }
    }
    const tally: Record<string, number> = {};
    for (const r of results) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
    return done({ ok: true, campaign_id: campaign.id, tally, results });
  } catch (e) {
    return done({ error: String(e) }, 500);
  }
});
