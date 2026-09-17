import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Search, Upload, Send, Globe, Users, ShieldCheck, Check, ArrowUpRight, ArrowLeft,
  LayoutDashboard, Target, Building2, PhoneCall, Mail, FileText, ChevronRight, X, Sparkles, Settings2, Copy, CreditCard, LogOut,
} from 'lucide-react';
import {
  prospectsList, prospectGet, prospectUpdate, prospectSuppress, prospectPromote,
  sourceTaxonomy, sourceSearch, sourceStartRun, sourceRuns, sourceCancelRun, ingestPropose, ingestCommit,
  outreachList, outreachCreate, outreachUpdate, outreachDraftTemplates, outreachEnrol,
  outreachQueue, outreachApprove, outreachApproveAll, outreachRun, outreachMarkReplied, outreachUpdateTouch,
  dfListings,
  getOrgSettings, setOrgSettings, crmList, crmAddTask, crmCompleteTask, crmAiTasks, crmApproveReply,
  buyboxList, buyboxChat, buyboxCreate, buyboxActivate, buyboxDelete,
  dfAdminReleases, dfAdminReleaseUpsert, dfAdminPublish, dfAdminBoard, dfAdminDecide, dfAdminAdvance,
  dfAdminExclusivity, dfAdminAnswer, dfAdminCountersign, dfAdminMembers, dfAdminMemberUpsert,
  onboardStatus, onboardCompleteTour, billingPortal,
} from '../../lib/acq';
import Paywall, { CreditsTopUp, UnlockChoice } from '../../components/Paywall';
import { creditsBalance } from '../../lib/acq';

// Plan gate: free workspaces hit the paywall on paid capabilities.
let CURRENT_PLAN = 'free';
let PROSPECTS_PRESET_STAGE = '';
export const requirePaid = () => {
  if (CURRENT_PLAN === 'free') { window.dispatchEvent(new Event('oi:paywall')); return false; }
  return true;
};

const TOUR_STEPS: { key: View | null; title: string; text: string }[] = [
  { key: 'dashboard', title: 'Your command centre', text: 'Everything starts here: live counts of prospects, campaigns and replies. This is the advantage - while others browse listings, your system is out finding owners.' },
  { key: 'buybox', title: 'Your buy box runs the show', text: 'Built from your expertise and capital by the coach. Every search, score and letter keys off it. Refine it any time - you can run several.' },
  { key: 'find', title: 'Find companies in seconds', text: '900,000+ UK companies, filtered to your buy box instantly: distance, size, owner age, even distressed businesses. No rate limits, no lists to buy.' },
  { key: 'prospects', title: 'Your private prospect CRM', text: 'Everything you source lands here, scored and explained. Track letters, log calls, attach notes. Sourced data stays in the platform - your uploads stay yours.' },
  { key: 'campaigns', title: 'Outreach on autopilot', text: 'Letters first, by design - a rejected cold email burns a contact forever, a letter does not. AI drafts in your voice; nothing sends without your approval. (Paid)' },
  { key: 'about', title: 'About you writes your letters', text: 'Your bio, phone and credibility highlights go into every letter and email the AI drafts, and your contact details are stamped under each sign-off. Two minutes here lifts reply rates more than anything else.' },
  { key: 'dealflow', title: 'Community deal flow', text: "Off-market deals we source and release to members. Browse teasers free; NDA and data-room access unlock with your plan tier." },
  { key: null, title: 'And when a deal gets real…', text: 'Add it to your pipeline (free, always) and get your Acquisition Score. The AI analyst, committee and memos join on any paid plan. Good hunting.' },
];

// ---------------------------------------------------------------------------
// The Origination workspace: a full product surface (not a modal).
// Navy sidebar + light content area. Everything keys off the org buy box,
// which is captured by the onboarding wizard on first run.
// ---------------------------------------------------------------------------

const NAVY = '#0A2540';
const card = 'bg-white rounded-xl border border-gray-200 shadow-sm';
const input__ = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#0A2540] focus:ring-1 focus:ring-[#0A2540]/30 bg-white';
const btnPrimary = 'inline-flex items-center gap-1.5 bg-[#0A2540] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#0E3257] disabled:opacity-40';
const btnGold = 'inline-flex items-center gap-1.5 bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-lg text-sm font-bold hover:brightness-95 disabled:opacity-40';
const btnGhost = 'inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-40';
const chip = (on: boolean) => 'text-[12px] px-3 py-1.5 rounded-full border cursor-pointer transition ' + (on ? 'bg-[#0A2540] text-white border-[#0A2540] font-semibold' : 'border-gray-300 text-gray-600 hover:border-[#0A2540]/50');

const STAGE_TINT: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600', enriched: 'bg-blue-50 text-blue-700', in_campaign: 'bg-purple-50 text-purple-700',
  replied: 'bg-amber-50 text-amber-700', qualified: 'bg-emerald-50 text-emerald-700', promoted: 'bg-[#0A2540] text-[#FFD700]',
  suppressed: 'bg-red-50 text-red-600', disqualified: 'bg-red-50 text-red-600',
};
const PROV_LABEL: Record<string, string> = { platform: 'Sourced', uploaded: 'Your upload', funnel: 'Funnel lead', meta_ads: 'Meta lead' };
const fitTint = (n: number | null) => n == null ? 'bg-gray-100 text-gray-400' : n >= 80 ? 'bg-emerald-100 text-emerald-800' : n >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500';
const money = (n: any) => n == null ? '-' : '£' + Number(n).toLocaleString();

type View = 'dashboard' | 'find' | 'prospects' | 'contacts' | 'campaigns' | 'dealflow' | 'members' | 'funnel' | 'buybox' | 'about' | 'billing';

export default function Origination() {
  const qp = new URLSearchParams(window.location.search);
  const deepView = qp.get('view') as View | null;
  const deepSubmission = qp.get('submission');
  const [view, setView] = useState<View>(deepView === 'dealflow' ? 'dealflow' : 'dashboard');
  useEffect(() => { viewRef.current = view; setErr(''); }, [view]); // stale errors never follow you between views
  const [settings, setSettings] = useState<any | null>(null);
  const [orgName, setOrgName] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [err, setErr] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [topup, setTopup] = useState<'ai' | 'letter' | null>(null);
  const [, setPlan] = useState<string>('free'); // plan gating uses module-level CURRENT_PLAN
  const [isHost, setIsHost] = useState<boolean>(true);
  const viewRef = useRef<View>('dashboard');
  const [tour, setTour] = useState<number>(qp.get('tour') === '1' ? 0 : -1);

  useEffect(() => {
    onboardStatus().then((st) => { CURRENT_PLAN = st.plan ?? 'free'; setPlan(st.plan ?? 'free'); setIsHost(st.is_host_org !== false); if (st.is_host_org === false && ['members', 'dealflow'].includes(viewRef.current)) setView('dashboard'); }).catch(() => { CURRENT_PLAN = 'team'; });
    const onPaywall = () => setPaywall(true);
    const onUnlock = () => setUnlock(true);
    window.addEventListener('oi:unlock', onUnlock);
    const onTopup = (e: any) => setTopup(e.detail?.kind ?? 'letter');
    window.addEventListener('oi:paywall', onPaywall);
    window.addEventListener('oi:topup', onTopup);
    return () => { window.removeEventListener('oi:paywall', onPaywall); window.removeEventListener('oi:topup', onTopup); window.removeEventListener('oi:unlock', () => setUnlock(true)); };
  }, []);
  useEffect(() => { const k = TOUR_STEPS[tour]?.key; if (tour >= 0 && k && (isHost || !HOST_ONLY.includes(k as View))) setView(k as View); }, [tour]);
  const endTour = () => { setTour(-1); onboardCompleteTour().catch(() => {}); window.history.replaceState({}, '', '/admin/origination'); };

  const reloadSettings = async () => {
    const r = await getOrgSettings();
    setSettings(r.settings ?? {}); setOrgName(r.org_name ?? '');
    if (!r.settings?.buy_box && deepView !== 'dealflow') setView('buybox');
    return r.settings ?? {};
  };
  useEffect(() => { reloadSettings().catch((e) => setErr(e.message || String(e))); }, []);

  const HOST_ONLY: View[] = ['dealflow', 'members'];
  const NAV: { key: View; label: string; icon: any }[] = ([
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'find', label: 'Find companies', icon: Search },
    { key: 'prospects', label: 'Prospects', icon: Building2 },
    { key: 'contacts', label: 'Tasks', icon: Users },
    { key: 'campaigns', label: 'Campaigns', icon: Send },
    { key: 'dealflow', label: 'Deal flow', icon: Sparkles },
    { key: 'members', label: 'Members', icon: Users },
    { key: 'funnel', label: 'Funnel & Meta ads', icon: Globe },
    { key: 'buybox', label: 'Buy box', icon: Target },
    { key: 'about', label: 'About you', icon: Users },
    { key: 'billing', label: 'Usage & billing', icon: CreditCard },
  ] as { key: View; label: string; icon: any }[]).filter((i) => isHost || !HOST_ONLY.includes(i.key));

  if (settings === null) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Origination…</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ============ SIDEBAR ============ */}
      <aside className="w-60 shrink-0 flex flex-col text-white" style={{ background: NAVY }}>
        <div className="px-5 pt-6 pb-4">
          <div className="text-[#FFD700] font-serif font-bold text-lg leading-tight">Origination</div>
          <div className="text-white/45 text-[11px] mt-0.5">{orgName}</div>
        </div>
        <nav className="flex-1 px-3 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-left transition ' + (view === n.key ? 'bg-white/10 text-white font-semibold' : 'text-white/60 hover:text-white hover:bg-white/5') + (tour >= 0 && TOUR_STEPS[tour]?.key === n.key ? ' ring-2 ring-[#FFD700]' : '')}>
              <n.icon className="h-4 w-4" />{n.label}
              {view === n.key && <ChevronRight className="h-3.5 w-3.5 ml-auto text-[#FFD700]" />}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <a href="/deals" className="flex items-center gap-2 text-[#FFD700]/90 hover:text-[#FFD700] text-[13px] mb-2.5"><Sparkles className="h-4 w-4" /> Community deals</a>
          <Link to="/admin/pipeline" className="flex items-center gap-2 text-white/60 hover:text-white text-[13px]"><ArrowLeft className="h-4 w-4" /> Back to pipeline</Link>
          <button onClick={async () => { await supabase?.auth.signOut(); window.location.href = '/signup'; }} className="flex items-center gap-2 text-white/60 hover:text-white text-[13px] mt-2.5"><LogOut className="h-4 w-4" /> Sign out</button>
          <div className="flex items-start gap-1.5 text-[10px] text-white/35 mt-3 leading-relaxed"><ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px" /> Sourced data lives here and cannot be exported. Lists you upload remain yours.</div>
        </div>
      </aside>

      {/* ============ CONTENT ============ */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {err && <div className="m-6 mb-0 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{err}</div>}
        {paywall && <Paywall onClose={() => setPaywall(false)} />}
        {unlock && <UnlockChoice context="Activate your campaign" onClose={() => setUnlock(false)} />}
        {topup && <CreditsTopUp focus={topup} onClose={() => setTopup(null)} />}
        {tour >= 0 && TOUR_STEPS[tour] && (
          <div className="fixed bottom-6 right-6 z-[70] max-w-sm bg-white rounded-2xl shadow-2xl border-2 border-[#FFD700] p-5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tour {tour + 1} of {TOUR_STEPS.length}</div>
            <div className="font-serif font-bold text-gray-900 text-lg mt-1">{TOUR_STEPS[tour].title}</div>
            <p className="text-[13px] text-gray-600 mt-1.5 leading-relaxed">{TOUR_STEPS[tour].text}</p>
            <div className="flex items-center justify-between mt-4">
              <button className="text-[12px] text-gray-400 hover:text-gray-600" onClick={endTour}>Skip tour</button>
              <button className={btnGold + ' !py-2'} onClick={() => (tour + 1 < TOUR_STEPS.length ? setTour(tour + 1) : endTour())}>
                {tour + 1 < TOUR_STEPS.length ? 'Next' : "Let's go"}
              </button>
            </div>
          </div>
        )}
        {view === 'dashboard' && <Dashboard setErr={setErr} go={setView} buyBox={settings.buy_box} openWizard={() => setView('buybox')} />}
        {view === 'find' && <FindView setErr={setErr} buyBox={settings.buy_box} go={setView} />}
        {view === 'prospects' && <ProspectsView setErr={setErr} />}
        {view === 'contacts' && <ContactsView setErr={setErr} go={setView} />}
        {view === 'campaigns' && <CampaignsView setErr={setErr} buyBox={settings.buy_box} profile={settings?.profile} goAbout={() => setView('about')} />}
        {view === 'dealflow' && <DealFlowView setErr={setErr} initialSubmission={deepSubmission} />}
        {view === 'members' && <MembersView setErr={setErr} />}
        {view === 'funnel' && <FunnelView setErr={setErr} settings={settings} onSaved={reloadSettings} />}
        {view === 'buybox' && <BuyBoxView openWizard={() => setShowWizard(true)} setErr={setErr} onChanged={() => reloadSettings()} />}
        {view === 'about' && <AboutView settings={settings} onSaved={reloadSettings} setErr={setErr} />}
        {view === 'billing' && <BillingView settings={settings} onSaved={reloadSettings} setErr={setErr} />}
      </main>

      {showWizard && <BuyBoxWizard orgName={orgName} settings={settings} onDone={async () => { setShowWizard(false); await reloadSettings(); setView('find'); }} onSkip={() => setShowWizard(false)} />}
    </div>
  );
}

function Header({ title, sub, children }: { title: string; sub?: string; children?: any }) {
  return (
    <div className="flex items-end justify-between px-8 pt-7 pb-5">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
        {sub && <p className="text-[13px] text-gray-500 mt-0.5 max-w-2xl">{sub}</p>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}


function IndustryPicker({ tax, sel, setSel, max = 10, height = 'max-h-72' }: { tax: any[]; sel: string[]; setSel: any; max?: number; height?: string }) {
  const [q, setQ] = useState('');
  const filtered = q ? tax.filter((t) => t.label.toLowerCase().includes(q.toLowerCase()) || t.group.toLowerCase().includes(q.toLowerCase())) : tax;
  const groups: Record<string, any[]> = {};
  for (const t of filtered) (groups[t.group] = groups[t.group] || []).push(t);
  const toggle = (k: string) => setSel((s: string[]) => s.includes(k) ? s.filter((x) => x !== k) : s.length < max ? [...s, k] : s);
  return (
    <div>
      <input className={input__ + ' w-full mb-2'} placeholder={'Search ' + tax.length + ' business types\u2026'} value={q} onChange={(e) => setQ(e.target.value)} />
      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {sel.map((k) => { const t = tax.find((x) => x.key === k); return (
            <button key={k} onClick={() => toggle(k)} className="text-[11px] px-2 py-1 rounded-full bg-[#0A2540] text-white flex items-center gap-1">{t?.label ?? k}<X className="h-3 w-3" /></button>
          ); })}
        </div>
      )}
      <div className={height + ' overflow-y-auto pr-1'}>
        {Object.entries(groups).map(([g, items]) => (
          <div key={g} className="mb-2.5">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{g}</div>
            <div className="flex flex-wrap gap-1.5">{(items as any[]).map((t) => <button key={t.key} onClick={() => toggle(t.key)} className={chip(sel.includes(t.key))}>{t.label}</button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ ONBOARDING WIZARD ============================
function BuyBoxWizard({ orgName, settings, onDone, onSkip }: { orgName: string; settings: any; onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const [tax, setTax] = useState<{ key: string; label: string; group: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const bb = settings?.buy_box ?? {};
  const [industries, setIndustries] = useState<string[]>(bb.industries ?? []);
  const [location, setLocation] = useState(bb.location ?? '');
  const [radiusMiles, setRadiusMiles] = useState(String(bb.radius_miles ?? 25));
  const [sizeBand, setSizeBand] = useState(bb.size_band ?? 'small_plus');
  const [regions, setRegions] = useState<string[]>(bb.regions ?? []);
  const [revMin, setRevMin] = useState(bb.revenue_min ?? '750000');
  const [profMin, setProfMin] = useState(bb.profit_min ?? '180000');
  const [yearsMin, setYearsMin] = useState(String(bb.years_trading_min ?? 8));
  const [succession, setSuccession] = useState(bb.succession_pref !== false);
  const [senderName, setSenderName] = useState(settings?.outreach?.sender_name ?? '');
  const REGIONS = ['London','South East','South West','Midlands','East of England','North West','Yorkshire','North East','Wales','Scotland','Northern Ireland'];

  useEffect(() => { sourceTaxonomy().then((r) => setTax(r.taxonomy)).catch(() => setTax([])); }, []);
  const toggle = (arr: string[], set: (v: string[]) => void, k: string, max = 99) => set(arr.includes(k) ? arr.filter((x) => x !== k) : arr.length < max ? [...arr, k] : arr);

  const save = async () => {
    setBusy(true);
    try {
      await setOrgSettings({ ...(settings ?? {}), outreach: { ...(settings?.outreach ?? {}), sender_name: senderName || undefined } });
      await buyboxCreate(
        { name: 'Wizard buy box', industries, location, radius_miles: Number(radiusMiles) || 0, size_band: sizeBand, regions, revenue_min: Number(revMin) || null, profit_min: Number(profMin) || null, years_trading_min: Number(yearsMin) || 8, succession_pref: succession, completed_at: new Date().toISOString() },
        { name: 'Wizard buy box', created_from: 'wizard' },
      );
      onDone();
    } finally { setBusy(false); }
  };

  const steps = ['Industries', 'Geography', 'Size & signals', 'Your identity'];
  const canNext = step === 0 ? industries.length > 0 : true;
  return (
    <div className="fixed inset-0 z-[70] bg-[#0A2540]/95 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 pt-7 pb-5" style={{ background: NAVY }}>
          <div className="text-[#FFD700] font-serif font-bold text-xl">Let's define your buy box</div>
          <p className="text-white/60 text-[13px] mt-1">Everything in Origination works off this: which companies we find, how they're scored, and how outreach is written for {orgName || 'you'}. Two minutes, and you can change it any time.</p>
          <div className="flex gap-1.5 mt-4">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={'h-1 rounded-full ' + (i <= step ? 'bg-[#FFD700]' : 'bg-white/15')} />
                <div className={'text-[10px] mt-1 ' + (i === step ? 'text-white' : 'text-white/40')}>{s}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-8 py-6 min-h-[300px]">
          {step === 0 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">Which boring-but-good industries do you want to own?</h3>
              <p className="text-[13px] text-gray-500 mb-4">Pick as many as you like. These map to Companies House SIC codes behind the scenes.</p>
              <IndustryPicker tax={tax} sel={industries} setSel={setIndustries} max={30} height="max-h-60" />
            </>
          )}
          {step === 1 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">Where do you want to buy?</h3>
              <p className="text-[13px] text-gray-500 mb-4">A home town or city gives the sharpest search; regions widen the net.</p>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">Primary town / city</label>
              <div className="flex gap-3 mb-4 items-end">
                <input className={input__ + ' w-64'} placeholder="e.g. Manchester" value={location} onChange={(e) => setLocation(e.target.value)} />
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Within</label>
                  <select className={input__} value={radiusMiles} onChange={(e) => setRadiusMiles(e.target.value)}><option value="0">Town only</option><option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="75">75 miles</option></select></div>
              </div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Regions</label>
              <div className="flex flex-wrap gap-2">{REGIONS.map((r) => <button key={r} onClick={() => toggle(regions, setRegions, r)} className={chip(regions.includes(r))}>{r}</button>)}</div>
            </>
          )}
          {step === 2 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">What size of business, and which signals matter?</h3>
              <p className="text-[13px] text-gray-500 mb-4">We score every prospect 0–100 against this.</p>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Min revenue (£)</label><input className={input__ + ' w-full'} value={revMin} onChange={(e) => setRevMin(e.target.value.replace(/[^0-9]/g, ''))} /></div>
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Min adjusted EBITDA (£)</label><input className={input__ + ' w-full'} value={profMin} onChange={(e) => setProfMin(e.target.value.replace(/[^0-9]/g, ''))} /></div>
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Trading at least</label>
                  <select className={input__ + ' w-full'} value={yearsMin} onChange={(e) => setYearsMin(e.target.value)}><option value="5">5 years</option><option value="8">8 years</option><option value="15">15 years</option></select></div>
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Company size (filed accounts)</label>
                  <select className={input__ + ' w-full'} value={sizeBand} onChange={(e) => setSizeBand(e.target.value)}><option value="any">Any size</option><option value="small_plus">£632k+ turnover</option><option value="medium_plus">£10.2m+ turnover</option></select></div>
              </div>
              <label className="flex items-center gap-2.5 mt-5 cursor-pointer max-w-md">
                <input type="checkbox" checked={succession} onChange={(e) => setSuccession(e.target.checked)} className="h-4 w-4 accent-[#0A2540]" />
                <span className="text-[13px] text-gray-700">Prioritise <b>succession signals</b> - owners aged 55+ with no obvious successor (the strongest "will sell" indicator)</span>
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">Who is the outreach from?</h3>
              <p className="text-[13px] text-gray-500 mb-4">Letters and emails are written in a personal voice. Owners respond to people, not companies.</p>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">Your name (as signed on letters)</label>
              <input className={input__ + ' w-72'} placeholder="e.g. Sandeep Bansal" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
              <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-[13px] text-gray-600">
                <b className="text-gray-800">Your buy box:</b> {industries.length} industries · {location || regions.join(', ') || 'UK-wide'} · £{Number(revMin || 0).toLocaleString()}+ revenue · £{Number(profMin || 0).toLocaleString()}+ profit · {yearsMin}+ years{succession ? ' · succession priority' : ''}
              </div>
            </>
          )}
        </div>
        <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onSkip} className="text-gray-400 hover:text-gray-600 text-[13px]">Skip for now</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className={btnGhost}>Back</button>}
            {step < 3 ? <button disabled={!canNext} onClick={() => setStep(step + 1)} className={btnPrimary}>Continue</button>
              : <button disabled={busy} onClick={save} className={btnGold}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save buy box & start sourcing</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ DASHBOARD ============================
function Dashboard({ setErr, go, buyBox, openWizard }: { setErr: (s: string) => void; go: (v: View) => void; buyBox: any; openWizard: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [pRows, setPRows] = useState<any[]>([]);
  const [camps, setCamps] = useState<any[]>([]);
  const [sentTouches, setSentTouches] = useState<any[]>([]);
  const [attention, setAttention] = useState<{ count: number; top: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([prospectsList({ per: 300 }), outreachList()])
      .then(([p, c]) => { setCounts(p.stage_counts || {}); setTotal(Object.values(p.stage_counts || {}).reduce((a, b) => a + b, 0)); setPRows(p.prospects || []); setCamps(c.campaigns); })
      .catch((e) => setErr(e.message || String(e))).finally(() => setLoading(false));
    outreachQueue('sent').then((q) => setSentTouches(q.touches ?? [])).catch(() => {});
    // Buy-box deals in the community flow that have had no action from you yet
    Promise.all([dfListings(), buyboxList(), sourceTaxonomy()]).then(([l, bb, tx]) => {
      const groups: Record<string, string> = Object.fromEntries((tx.taxonomy ?? []).map((t: any) => [t.key, String(t.group ?? '').toLowerCase()]));
      const boxes = (bb.boxes ?? []).map((b: any) => new Set((b.criteria?.industries ?? []).map((k: string) => groups[k]).filter(Boolean)));
      const fresh = (l.listings ?? []).filter((x: any) => !x.my_state && x.status === 'live' && boxes.some((g) => g.has(String(x.sector_group ?? '').toLowerCase())));
      setAttention({ count: fresh.length, top: fresh.slice(0, 3) });
    }).catch(() => setAttention({ count: 0, top: [] }));
  }, []);
  const needsApproval = camps.reduce((a, c) => a + (c.needs_approval || 0), 0);
  const sent = camps.reduce((a, c) => a + (c.sent || 0), 0);
  const replied = (counts.replied || 0) + (counts.qualified || 0);
  const promoted = counts.promoted || 0;
  const inCampaigns = counts.in_campaign || 0;

  // last 14 days of sends for the activity bars
  const days: { label: string; letters: number; emails: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const of = sentTouches.filter((t) => String(t.sent_at ?? '').slice(0, 10) === key);
    days.push({ label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), letters: of.filter((t) => t.channel === 'letter').length, emails: of.filter((t) => t.channel !== 'letter').length });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.letters + d.emails));

  const funnel = [
    { label: 'Prospects', value: total, view: 'prospects' as View, stage: '' },
    { label: 'In campaigns', value: inCampaigns, view: 'prospects' as View, stage: 'in_campaign' },
    { label: 'Sent', value: sent, view: 'campaigns' as View, stage: '' },
    { label: 'Replied', value: replied, view: 'prospects' as View, stage: 'replied' },
    { label: 'Deals', value: promoted, view: 'prospects' as View, stage: 'promoted' },
  ];
  const maxF = Math.max(1, ...funnel.map((f) => f.value));

  // granular analytics, computed from the live prospect sample
  const STAGE_META: [string, string, string][] = [
    ['new', 'New', '#94A3B8'], ['enriched', 'Enriched', '#7FB2E5'], ['qualified', 'Qualified', '#C9A227'],
    ['in_campaign', 'In campaign', '#FFD700'], ['replied', 'Replied', '#6EE7B7'], ['promoted', 'On pipeline', '#10B981'], ['suppressed', 'Opted out', '#E2E8F0'],
  ];
  const stageMax = Math.max(1, ...STAGE_META.map(([k]) => counts[k] || 0));
  const fit = (r: any) => Number(r.fit_score ?? r.fit ?? -1);
  const fitBuckets = [
    { label: 'Strong fit 80+', n: pRows.filter((r) => fit(r) >= 80).length, c: '#10B981' },
    { label: 'Good 65-79', n: pRows.filter((r) => fit(r) >= 65 && fit(r) < 80).length, c: '#FFD700' },
    { label: 'Fair 50-64', n: pRows.filter((r) => fit(r) >= 50 && fit(r) < 65).length, c: '#C9A227' },
    { label: 'Low or unscored', n: pRows.filter((r) => fit(r) < 50).length, c: '#CBD5E1' },
  ];
  const fitTotal = Math.max(1, fitBuckets.reduce((a, b) => a + b.n, 0));
  const regionCounts: Record<string, number> = {};
  for (const r of pRows) { const g = String(r.region ?? '').trim(); if (g) regionCounts[g] = (regionCounts[g] || 0) + 1; }
  const topRegions = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const regionMax = Math.max(1, ...topRegions.map(([, n]) => n));
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : null;

  return (
    <>
      <Header title="Origination" sub="Find owners in your buy box, reach them across letter, email and phone, and move interested sellers straight onto your pipeline." >
        <button onClick={() => go('find')} className={btnGold}><Search className="h-4 w-4" />Find companies</button>
      </Header>
      <div className="px-8 pb-8">
        {!buyBox && (
          <button onClick={openWizard} className="w-full mb-5 text-left bg-[#0A2540] text-white rounded-xl p-5 flex items-center gap-4 hover:bg-[#0E3257] transition">
            <Sparkles className="h-6 w-6 text-[#FFD700] shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Set up your buy box to unlock Origination</div>
              <div className="text-white/60 text-[13px] mt-0.5">Industries, geography and deal size - everything here is driven by it. Takes two minutes.</div>
            </div>
            <ChevronRight className="h-5 w-5 text-[#FFD700]" />
          </button>
        )}
        {loading ? <div className="text-gray-400 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div> : (
          <>
            {/* the engine, as a funnel */}
            <div className="rounded-2xl p-6 mb-5 text-white" style={{ background: 'linear-gradient(120deg,#0A2540 0%,#0E3257 70%,#123A66 100%)' }}>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div className="font-serif font-bold text-[17px] text-[#FFD700]">Your origination engine</div>
                <div className="text-white/40 text-[12px]">register → letter → conversation → deal</div>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-5">
                {funnel.map((f, i) => (
                  <button key={f.label} onClick={() => { PROSPECTS_PRESET_STAGE = f.stage ?? ''; go(f.view); }} className="text-left group" title={f.stage ? 'See exactly who is at this step' : 'Open'}>
                    <div className="font-serif font-bold text-[26px] leading-none text-white group-hover:text-[#FFD700] transition">{f.value}</div>
                    <div className="text-[11px] text-white/50 mt-1">{f.label}</div>
                    <div className="mt-2.5 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: Math.max(6, Math.round((f.value / maxF) * 100)) + '%', background: i < 2 ? 'linear-gradient(90deg,#C9A227,#FFD700)' : i === 2 ? '#7FB2E5' : '#6EE7B7' }} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-[12px]">
                {needsApproval > 0 && <button onClick={() => go('campaigns')} className="text-[#FFD700] font-semibold hover:underline">{needsApproval} awaiting your approval →</button>}
                {(attention?.count ?? 0) > 0 && <Link to="/deals" className="text-emerald-300 font-semibold hover:underline">{attention!.count} buy-box deal{attention!.count > 1 ? 's' : ''} in the community flow need your eye →</Link>}
                {needsApproval === 0 && (attention?.count ?? 0) === 0 && <span className="text-white/35">Nothing needs you right now. The engine keeps working.</span>}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {/* every prospect, by stage, click any bar to see exactly who */}
              <div className={card + ' p-5'}>
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-gray-900">Prospects by stage</div>
                  <div className="text-[11px] text-gray-400">click a bar to see exactly who</div>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {STAGE_META.map(([k, label, colour]) => (
                    <button key={k} onClick={() => { PROSPECTS_PRESET_STAGE = k; go('prospects'); }} className="group flex items-center gap-3 text-left">
                      <span className="text-[11px] text-gray-500 w-24 shrink-0 group-hover:text-[#0A2540]">{label}</span>
                      <span className="flex-1 h-4 rounded-full bg-gray-50 overflow-hidden">
                        <span className="block h-full rounded-full transition-all duration-700" style={{ width: Math.max(counts[k] ? 4 : 0, Math.round(((counts[k] || 0) / stageMax) * 100)) + '%', background: colour }} />
                      </span>
                      <span className="text-[12px] font-bold text-gray-700 w-12 text-right tabular-nums">{(counts[k] || 0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* quality and geography of the pool */}
              <div className={card + ' p-5'}>
                <div className="font-semibold text-gray-900">Quality of the pool <span className="text-[11px] font-normal text-gray-400">latest {pRows.length.toLocaleString()} prospects</span></div>
                <div className="mt-4 h-4 rounded-full overflow-hidden flex">
                  {fitBuckets.map((b) => b.n > 0 && <span key={b.label} title={b.label + ': ' + b.n} style={{ width: (b.n / fitTotal) * 100 + '%', background: b.c }} />)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                  {fitBuckets.map((b) => (
                    <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500"><span className="h-2 w-2 rounded-full" style={{ background: b.c }} /> {b.label} · <b className="text-gray-700">{b.n}</b></span>
                  ))}
                </div>
                {topRegions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-50">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Where they are</div>
                    {topRegions.map(([g, n]) => (
                      <div key={g} className="flex items-center gap-3 py-1">
                        <span className="text-[11px] text-gray-500 w-28 truncate shrink-0">{g}</span>
                        <span className="flex-1 h-2.5 rounded-full bg-gray-50 overflow-hidden"><span className="block h-full rounded-full" style={{ width: Math.round((n / regionMax) * 100) + '%', background: 'linear-gradient(90deg,#0A2540,#123A66)' }} /></span>
                        <span className="text-[11px] font-bold text-gray-600 w-10 text-right tabular-nums">{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {/* activity, last 14 days */}
              <div className={card + ' p-5'}>
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-gray-900">Outreach activity</div>
                  <div className="text-[11px] text-gray-400">{replyRate !== null && <span className="text-emerald-600 font-bold mr-2">{replyRate}% reply rate</span>}last 14 days · <span className="text-[#A67C00] font-semibold">letters</span> · <span className="text-[#0A2540] font-semibold">emails</span></div>
                </div>
                {sent === 0 ? (
                  <div className="text-[13px] text-gray-400 mt-4 bg-gray-50 rounded-lg px-4 py-3">Nothing sent yet. Approve your queued letters and the bars start here.</div>
                ) : (
                  <div className="flex items-end gap-1.5 h-28 mt-4">
                    {days.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end items-stretch gap-px h-full" title={`${d.letters} letters · ${d.emails} emails`}>
                        <div className="rounded-t-sm" style={{ height: Math.round((d.emails / maxDay) * 100) + '%', background: '#0A2540', opacity: d.emails ? 1 : 0 }} />
                        <div className={d.emails ? '' : 'rounded-t-sm'} style={{ height: Math.round((d.letters / maxDay) * 100) + '%', background: 'linear-gradient(180deg,#FFD700,#C9A227)', opacity: d.letters ? 1 : 0 }} />
                        <div className="h-px bg-gray-200" />
                        <div className="text-[9px] text-gray-300 text-center">{d.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* community deals needing attention */}
              <div className={card + ' p-5'}>
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-gray-900">Deal flow, matched to your buy box</div>
                  <Link to="/deals" className="text-[11px] font-bold text-[#0A2540] hover:underline">Open deal flow →</Link>
                </div>
                {!attention ? <div className="text-gray-300 mt-4"><Loader2 className="h-4 w-4 animate-spin" /></div> : attention.count === 0 ? (
                  <div className="text-[13px] text-gray-400 mt-4 bg-gray-50 rounded-lg px-4 py-3">No unreviewed buy-box matches right now. New releases land here the moment they match your mandate.</div>
                ) : (
                  <div className="mt-3 divide-y divide-gray-50">
                    {attention.top.map((l: any) => (
                      <Link key={l.id} to={'/deals/' + l.id} className="flex items-center gap-3 py-2.5 group">
                        <span className="inline-flex items-center gap-1 bg-[#FFFDF2] border border-[#FFD700] text-[#7A6200] text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"><Sparkles className="h-2.5 w-2.5" />Buy box</span>
                        <span className="text-[13px] font-medium text-gray-800 truncate flex-1 group-hover:text-[#0A2540]">{l.headline}</span>
                        <span className="text-[11px] text-gray-400 shrink-0">{l.region ?? ''}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#0A2540] shrink-0" />
                      </Link>
                    ))}
                    {attention.count > 3 && <Link to="/deals" className="block text-[12px] font-semibold text-[#0A2540] pt-2.5 hover:underline">{attention.count - 3} more waiting →</Link>}
                  </div>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className={card + ' p-5'}>
                <div className="font-semibold text-gray-900 mb-3">How it flows</div>
                {[
                  ['Find companies', 'Companies House, filtered to your buy box, scored for fit and succession', 'find'],
                  ['Enrol in a campaign', 'Letter first, then email, then a call task - drafted in your voice, sent only after you approve', 'campaigns'],
                  ['Replies come back', 'Interested owners are flagged; unsubscribes are suppressed automatically', 'prospects'],
                  ['Promote to deal', 'One click puts them on your pipeline with the full history attached', 'prospects'],
                ].map(([t, d, v], i) => (
                  <button key={t as string} onClick={() => go(v as View)} className="w-full text-left flex gap-3 py-2.5 group">
                    <div className="h-6 w-6 rounded-full bg-[#0A2540] text-[#FFD700] text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                    <div><div className="text-[13px] font-semibold text-gray-800 group-hover:text-[#0A2540]">{t}</div><div className="text-[12px] text-gray-500">{d}</div></div>
                  </button>
                ))}
              </div>
              <div className={card + ' p-5'}>
                <div className="font-semibold text-gray-900 mb-3">Campaigns</div>
                {camps.length === 0 ? (
                  <div className="text-[13px] text-gray-500">No campaigns yet. Create one and the AI drafts the letter, email and call brief from your buy box.
                    <div className="mt-3"><button onClick={() => go('campaigns')} className={btnPrimary}><Send className="h-4 w-4" />Create your first campaign</button></div>
                  </div>
                ) : camps.slice(0, 4).map((c) => (
                  <button key={c.id} onClick={() => go('campaigns')} className="w-full py-2.5 border-b border-gray-50 last:border-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className={'h-2 w-2 rounded-full ' + (c.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300')} />
                      <span className="text-[13px] font-medium text-gray-800 flex-1 truncate">{c.name}</span>
                      <span className="text-[12px] text-gray-400">{c.members} enrolled · {c.sent} sent · {c.replied} replied</span>
                    </div>
                    <div className="mt-1.5 ml-4 h-2 rounded-full bg-gray-50 overflow-hidden flex">
                      <span style={{ width: Math.min(100, Math.round(((c.sent || 0) / Math.max(1, c.members || 0)) * 100)) + '%', background: 'linear-gradient(90deg,#C9A227,#FFD700)' }} title={c.sent + ' sent'} />
                      <span style={{ width: Math.min(100, Math.round(((c.replied || 0) / Math.max(1, c.members || 0)) * 100)) + '%', background: '#6EE7B7' }} title={c.replied + ' replied'} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================ FIND ============================
function FindView({ setErr, buyBox, go }: { setErr: (s: string) => void; buyBox: any; go: (v: View) => void }) {
  const [tax, setTax] = useState<{ key: string; label: string; group: string }[]>([]);
  const [sel, setSel] = useState<string[]>(buyBox?.industries?.slice(0, 10) ?? []);
  const [location, setLocation] = useState(buyBox?.location ?? '');
  const [radius, setRadius] = useState(String(buyBox?.radius_miles ?? 25));
  const [sizeBand, setSizeBand] = useState(buyBox?.size_band ?? 'any');
  const [dirAge, setDirAge] = useState(buyBox?.succession_pref !== false ? '55' : '0');
  const REGIONS: Record<string, { label: string; town: string; miles: number }> = {
    nw: { label: 'North West', town: 'Manchester', miles: 60 }, yorks: { label: 'Yorkshire & Humber', town: 'Leeds', miles: 55 },
    ne: { label: 'North East', town: 'Newcastle upon Tyne', miles: 55 }, mids: { label: 'Midlands', town: 'Birmingham', miles: 65 },
    east: { label: 'East of England', town: 'Cambridge', miles: 65 }, ldn: { label: 'London', town: 'London', miles: 35 },
    se: { label: 'South East', town: 'Guildford', miles: 60 }, sw: { label: 'South West', town: 'Taunton', miles: 75 },
    wales: { label: 'Wales', town: 'Builth Wells', miles: 85 }, scot: { label: 'Central Scotland', town: 'Stirling', miles: 90 },
    ni: { label: 'Northern Ireland', town: 'Belfast', miles: 60 },
  };
  const [areaMode, setAreaMode] = useState<string>(buyBox?.location ? 'custom' : 'national');
  const geo = () => areaMode === 'national' ? { location: undefined, radius_miles: 0 }
    : areaMode === 'custom' ? { location: location || undefined, radius_miles: location ? Number(radius) : 0 }
    : { location: REGIONS[areaMode].town, radius_miles: REGIONS[areaMode].miles };
  const [statuses, setStatuses] = useState<string[]>(['active']);
  const [customSic, setCustomSic] = useState('');
  const [qName, setQName] = useState('');
  const [excludeExisting, setExcludeExisting] = useState(true);
  const STATUS_OPTS: [string, string][] = [['active', 'Active'], ['administration', 'In administration'], ['receivership', 'Receivership'], ['liquidation', 'Liquidation'], ['voluntary_arrangement', 'CVA']];
  const toggleStatus = (k: string) => setStatuses((x) => x.includes(k) ? (x.length > 1 ? x.filter((y) => y !== k) : x) : [...x, k]);
  const sicList = () => customSic.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{4,5}$/.test(x));
  const [minAge, setMinAge] = useState(String(buyBox?.years_trading_min ?? 8));
  const [maxN, setMaxN] = useState('25');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const loadRuns = () => sourceRuns().then((r) => setRuns(r.runs)).catch(() => {});
  useEffect(() => { sourceTaxonomy().then((r) => setTax(r.taxonomy)).catch((e) => setErr(e.message || String(e))); loadRuns(); const t = setInterval(loadRuns, 30000); return () => clearInterval(t); }, []);
  const startRun = async () => {
    if (!sel.length && !sicList().length) { setErr('Pick at least one industry or enter SIC codes'); return; }
    setErr('');
    if (!requirePaid()) return;
    try { const r = await sourceStartRun({ categories: sel, sic_codes: sicList(), statuses, q_name: qName || undefined, exclude_existing: excludeExisting, ...geo(), size_band: sizeBand, min_director_age: Number(dirAge), min_age_years: Number(minAge) }); alert(r.note); loadRuns(); }
    catch (e: any) { setErr(e.message || String(e)); }
  };
  const run = async () => {
    if (!sel.length && !sicList().length) { setErr('Pick at least one industry or enter SIC codes'); return; }
    setBusy(true); setErr(''); setResult(null);
    try { setResult(await sourceSearch({ categories: sel, sic_codes: sicList(), statuses, q_name: qName || undefined, exclude_existing: excludeExisting, ...geo(), size_band: sizeBand, min_director_age: Number(dirAge), min_age_years: Number(minAge), max_results: Number(maxN) })); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Find companies" sub="Live Companies House search across your target industries. We read director ages for succession signals and score every company against your buy box." />
      <div className="px-8 pb-8 flex gap-5">
        {/* filter rail */}
        <div className={card + ' w-72 shrink-0 p-5 h-fit'}>
          <div className="text-[12px] font-bold text-gray-800 uppercase tracking-wide mb-3">Filters</div>
          {buyBox && <div className="text-[11px] text-gray-400 mb-3 flex items-center gap-1"><Target className="h-3 w-3" /> Pre-filled from your buy box</div>}
          <div className="text-[12px] font-semibold text-gray-700 mb-2">Industries <span className="text-gray-400 font-normal">(up to 10)</span></div>
          <div className="mb-4"><IndustryPicker tax={tax} sel={sel} setSel={setSel} max={10} height="max-h-64" /></div>
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Custom SIC codes <span className="text-gray-400 font-normal">(optional, comma-separated)</span></div>
          <input className={input__ + ' w-full mb-3'} placeholder="e.g. 43220, 68209" value={customSic} onChange={(e) => setCustomSic(e.target.value)} />
          <div className="text-[12px] font-semibold text-gray-700 mb-1.5">Company status</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUS_OPTS.map(([k, label]) => <button key={k} onClick={() => toggleStatus(k)} className={chip(statuses.includes(k))}>{label}</button>)}
          </div>
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Name contains <span className="text-gray-400 font-normal">(optional)</span></div>
          <input className={input__ + ' w-full mb-3'} placeholder="e.g. skip hire" value={qName} onChange={(e) => setQName(e.target.value)} />
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Area</div>
          <select className={input__ + ' w-full mb-2'} value={areaMode} onChange={(e) => setAreaMode(e.target.value)}>
            <option value="national">National (all of UK)</option>
            {Object.entries(REGIONS).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            <option value="custom">Near a town / city…</option>
          </select>
          {areaMode === 'custom' && (<>
            <input className={input__ + ' w-full mb-2'} placeholder="e.g. Manchester" value={location} onChange={(e) => setLocation(e.target.value)} />
            <select className={input__ + ' w-full mb-3'} value={radius} onChange={(e) => setRadius(e.target.value)} disabled={!location}>
              <option value="0">Town match only</option><option value="10">Within 10 miles</option><option value="25">Within 25 miles</option><option value="50">Within 50 miles</option><option value="75">Within 75 miles</option>
            </select>
          </>)}
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Company size <span className="text-gray-400 font-normal">(from filed accounts)</span></div>
          <select className={input__ + ' w-full mb-3'} value={sizeBand} onChange={(e) => setSizeBand(e.target.value)}>
            <option value="any">Any size</option><option value="small_plus">£632k+ turnover</option><option value="medium_plus">£10.2m+ turnover</option>
          </select>
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Succession signal</div>
          <select className={input__ + ' w-full mb-3'} value={dirAge} onChange={(e) => setDirAge(e.target.value)}>
            <option value="0">Any director age</option><option value="55">Oldest director 55+</option><option value="60">Oldest director 60+</option>
          </select>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div><div className="text-[12px] font-semibold text-gray-700 mb-1">Trading</div>
              <select className={input__ + ' w-full'} value={minAge} onChange={(e) => setMinAge(e.target.value)}><option value="5">5+ yrs</option><option value="8">8+ yrs</option><option value="15">15+ yrs</option></select></div>
            <div><div className="text-[12px] font-semibold text-gray-700 mb-1">Results</div>
              <select className={input__ + ' w-full'} value={maxN} onChange={(e) => setMaxN(e.target.value)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></div>
          </div>
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-[12px] text-gray-600">
            <input type="checkbox" checked={excludeExisting} onChange={(e) => setExcludeExisting(e.target.checked)} className="h-3.5 w-3.5 accent-[#0A2540]" />
            Hide companies already in my Prospects
          </label>
          <button onClick={run} disabled={busy} className={btnGold + ' w-full justify-center'}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{busy ? 'Searching Companies House…' : 'Find companies'}</button>
        </div>
        {/* results */}
        <div className="flex-1 min-w-0">
          {runs.filter((r) => ['queued','running'].includes(r.status) || (r.status === 'done' && Date.now() - new Date(r.updated_at).getTime() < 86400000)).length > 0 && (
            <div className={card + ' p-4 mb-4'}>
              <div className="text-[12px] font-bold text-gray-800 uppercase tracking-wide mb-2">Background sourcing</div>
              {runs.filter((r) => ['queued','running','done'].includes(r.status)).slice(0, 4).map((r) => {
                const pct = r.candidates_total ? Math.min(100, Math.round((r.cursor_pos / r.candidates_total) * 100)) : 0;
                const pr = r.params ?? {}; const t = r.totals ?? {};
                return (
                  <div key={r.id} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className={'h-2 w-2 rounded-full ' + (r.status === 'done' ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse')} />
                      <span className="text-gray-700 font-medium truncate">{(pr.categories ?? []).slice(0, 3).map((k: string) => k.replace(/_/g, ' ')).join(', ')}{pr.location ? ' · ' + pr.location + (pr.radius_miles ? ` (${pr.radius_miles} mi)` : '') : ''}</span>
                      <span className="text-gray-400 ml-auto shrink-0">{r.status === 'done' ? `done · ${t.created ?? 0} added` : r.candidates_total ? `${r.cursor_pos}/${r.candidates_total} · ${t.created ?? 0} added` : 'queued'}</span>
                      {['queued','running'].includes(r.status) && <button onClick={async () => { await sourceCancelRun(r.id); loadRuns(); }} className="text-gray-300 hover:text-red-500 shrink-0" title="Cancel"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                    {r.status !== 'done' && <div className="h-1.5 bg-gray-100 rounded-full mt-1.5"><div className="h-1.5 rounded-full bg-[#0A2540] transition-all" style={{ width: pct + '%' }} /></div>}
                  </div>
                );
              })}
              <div className="text-[11px] text-gray-400 mt-2">Runs in the background at roughly 700 companies an hour - every match lands in Prospects automatically. You can close this page.</div>
            </div>
          )}
          {!result && !busy && (
            <div className={card + ' p-10 text-center text-gray-400'}>
              <Building2 className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <div className="text-gray-600 font-medium mb-1">Your next acquisition is already trading</div>
              <div className="text-[13px]">Pick industries on the left and run the search. Every result lands in your Prospects, scored and ready for outreach.</div>
            </div>
          )}
          {busy && <div className={card + ' p-10 text-center text-gray-400'}><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Searching Companies House - checking distances, filed accounts sizes and director ages. Tight filters can take up to a minute.</div>}
          {result && (
            <div className={card}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-[14px] text-gray-800"><b>{result.created}</b> new prospects added{result.updated ? `, ${result.updated} refreshed` : ''}</div>
                  <div className="text-[12px] text-gray-400 mt-0.5">
                    Analysed the {result.scanned} {result.considered && result.considered < result.total_hits ? 'nearest' : 'best'} of {Number(result.total_hits).toLocaleString()} matches
                    {result.excluded_size ? ` · ${result.excluded_size} excluded by size` : ''}{result.excluded_age ? ` · ${result.excluded_age} excluded by director age` : ''}
                    {result.rate_limited ? ' · stopped early: Companies House rate limit - wait a minute for more' : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  {result.considered > result.scanned && <button onClick={startRun} className={btnGhost}>Source all {Number(result.considered).toLocaleString()} in background</button>}
                  <button onClick={() => go('prospects')} className={btnPrimary}>Open Prospects<ArrowUpRight className="h-4 w-4" /></button>
                </div>
              </div>
              {result.prospects.map((p: any) => (
                <div key={p.id} className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-center gap-3">
                  <span className={'text-[11px] font-bold px-2 py-0.5 rounded-full ' + fitTint(p.fit_score)}>{p.fit_score}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-gray-800 truncate">{p.company_name}</div>
                    <div className="text-[12px] text-gray-400 truncate">{[p.company_number, p.address, p.distance_miles != null ? p.distance_miles + ' mi away' : null, p.size && !String(p.size).includes('unknown') ? p.size : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  {p.status && p.status !== 'active' && <span className="text-[11px] text-red-700 bg-red-50 px-2 py-0.5 rounded-full shrink-0 font-semibold">{p.status.replace(/_/g, ' ')}</span>}
                  {p.oldest_director_age && <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">Oldest director {p.oldest_director_age}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================ PROSPECTS ============================
function ProspectsView({ setErr }: { setErr: (s: string) => void }) {
  const [rows, setRows] = useState<any[]>([]); const [total, setTotal] = useState(0); const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [stage, setStage] = useState(() => { const v = PROSPECTS_PRESET_STAGE; PROSPECTS_PRESET_STAGE = ''; return v; }); const [minFit, setMinFit] = useState('');
  const [loading, setLoading] = useState(true); const [openId, setOpenId] = useState<string | null>(null); const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(''); const [uploadOpen, setUploadOpen] = useState(false);
  const [noteMode, setNoteMode] = useState<null | 'note' | 'call'>(null); const [noteText, setNoteText] = useState('');
  const saveNote = async () => {
    if (!noteText.trim() || !detail) return;
    setBusy('note');
    try {
      const stamp = `[${noteMode === 'call' ? 'Call' : 'Note'} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}] ${noteText.trim()}`;
      const newNotes = (detail.prospect.notes ? detail.prospect.notes + '\n\n' : '') + stamp;
      await prospectUpdate(detail.prospect.id, { notes: newNotes });
      setNoteMode(null); setNoteText('');
      setDetail(await prospectGet(detail.prospect.id));
    } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const per = 25;
  const load = async (p = page) => {
    setLoading(true); setErr('');
    try { const r = await prospectsList({ page: p, per, ...(q ? { q } : {}), ...(stage ? { stage } : {}), ...(minFit ? { min_fit: Number(minFit) } : {}) }); setRows(r.prospects); setTotal(r.total); setCounts(r.stage_counts || {}); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); setPage(1); }, [q, stage, minFit]);
  const openDrawer = async (id: string) => { setOpenId(id); setDetail(null); setNoteMode(null); setNoteText(''); try { setDetail(await prospectGet(id)); } catch (e: any) { setErr(e.message || String(e)); } };
  const promote = async (id: string) => { setBusy('p'); try { const r = await prospectPromote(id); setOpenId(null); await load(); alert('Now on your pipeline as ' + r.reference); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const suppress = async (id: string) => { setBusy('s'); try { await prospectSuppress(id); setOpenId(null); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const markReplied = async (id: string) => { setBusy('r'); try { await outreachMarkReplied(id); setOpenId(null); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };

  return (
    <>
      <Header title="Prospects" sub={`${total} companies in your CRM. Sourced data stays in here - it cannot be downloaded or exported.`}>
        <button onClick={() => setUploadOpen(true)} className={btnGhost}><Upload className="h-4 w-4" />Upload list</button>
      </Header>
      <div className="px-8 pb-8">
        <div className="flex gap-2 mb-4 items-center flex-wrap">
          <div className="relative"><Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" /><input className={input__ + ' pl-9 w-64'} placeholder="Search name, number, region…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={input__} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All active stages</option>
            {['new','enriched','in_campaign','replied','qualified','promoted','suppressed','disqualified'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}{counts[s] ? ` (${counts[s]})` : ''}</option>)}
          </select>
          <select className={input__} value={minFit} onChange={(e) => setMinFit(e.target.value)}><option value="">Any fit</option><option value="80">Fit 80+</option><option value="60">Fit 60+</option></select>
        </div>
        <div className={card + ' overflow-hidden'}>
          <table className="w-full text-left">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 font-semibold">Fit</th><th className="px-2 py-3 font-semibold">Company</th><th className="px-2 py-3 font-semibold hidden lg:table-cell">Region</th>
              <th className="px-2 py-3 font-semibold hidden md:table-cell">Succession</th><th className="px-2 py-3 font-semibold hidden md:table-cell">Revenue</th>
              <th className="px-2 py-3 font-semibold">Source</th><th className="px-5 py-3 font-semibold text-right">Stage</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-[13px]">No prospects match. Use <b>Find companies</b> or <b>Upload list</b> to fill your CRM.</td></tr>
                : rows.map((p) => (
                  <tr key={p.id} onClick={() => openDrawer(p.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-5 py-3"><span className={'text-[11px] font-bold px-2 py-0.5 rounded-full ' + fitTint(p.fit_score)}>{p.fit_score ?? '-'}</span></td>
                    <td className="px-2 py-3"><div className="text-[13px] font-semibold text-gray-800">{p.company_name}</div><div className="text-[11px] text-gray-400">{p.company_number ?? ''}</div></td>
                    <td className="px-2 py-3 text-[12px] text-gray-500 hidden lg:table-cell">{p.region ?? '-'}</td>
                    <td className="px-2 py-3 hidden md:table-cell">{p.oldest_director_age ? <span className={'text-[11px] px-2 py-0.5 rounded-full ' + (p.oldest_director_age >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500')}>Dir. {p.oldest_director_age}</span> : <span className="text-gray-300 text-[12px]">-</span>}</td>
                    <td className="px-2 py-3 text-[12px] text-gray-500 hidden md:table-cell">{money(p.revenue_estimate)}</td>
                    <td className="px-2 py-3"><span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{PROV_LABEL[p.provenance] ?? p.provenance}</span></td>
                    <td className="px-5 py-3 text-right"><span className={'text-[11px] font-semibold px-2 py-0.5 rounded-full ' + (STAGE_TINT[p.stage] ?? '')}>{p.stage.replace('_', ' ')}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }} className={btnGhost + ' disabled:opacity-30'}>Previous</button>
            <span className="text-[12px] text-gray-400">Page {page} of {Math.max(1, Math.ceil(total / per))}</span>
            <button disabled={page >= Math.ceil(total / per)} onClick={() => { const p = page + 1; setPage(p); load(p); }} className={btnGhost + ' disabled:opacity-30'}>Next</button>
          </div>
        </div>
      </div>

      {/* drawer */}
      {openId && (
        <div className="fixed inset-0 z-[65] bg-black/40 flex justify-end" onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
            {!detail ? <div className="p-8 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between" style={{ background: NAVY }}>
                  <div>
                    <div className="text-white font-bold text-[16px]">{detail.prospect.company_name}</div>
                    <div className="text-white/50 text-[12px] mt-0.5">{[detail.prospect.company_number, detail.prospect.region].filter(Boolean).join(' · ')}</div>
                    <span className={'inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full ' + fitTint(detail.prospect.fit_score)}>{detail.prospect.fit_score != null ? `Fit ${detail.prospect.fit_score}` : 'Unscored'}</span>
                  </div>
                  <button onClick={() => setOpenId(null)} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-6 py-5 text-[13px] text-gray-700 flex flex-col gap-4">
                  {detail.prospect.fit_reasons && <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg p-3 text-[12px]">{detail.prospect.fit_reasons}</div>}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {detail.prospect.incorporated_on && <div><div className="text-[11px] text-gray-400">Incorporated</div>{String(detail.prospect.incorporated_on).slice(0, 10)}</div>}
                    {detail.prospect.revenue_estimate && <div><div className="text-[11px] text-gray-400">Revenue ({detail.prospect.revenue_basis})</div>{money(detail.prospect.revenue_estimate)}</div>}
                    {detail.prospect.owner_name && <div><div className="text-[11px] text-gray-400">Owner</div>{detail.prospect.owner_name}</div>}
                    {detail.prospect.owner_email && <div className="col-span-2"><div className="text-[11px] text-gray-400">Email</div>{detail.prospect.owner_email}</div>}
                    {detail.prospect.owner_phone && <div><div className="text-[11px] text-gray-400">Phone</div>{detail.prospect.owner_phone}</div>}
                    {detail.prospect.address && <div className="col-span-2"><div className="text-[11px] text-gray-400">Address</div>{detail.prospect.address} {detail.prospect.postcode ?? ''}</div>}
                  </div>
                  {(detail.prospect.directors ?? []).length > 0 && (
                    <div><div className="text-[11px] text-gray-400 mb-1">Directors</div>
                      {(detail.prospect.directors as any[]).map((d, i) => <div key={i} className="flex justify-between py-1 border-b border-gray-50 last:border-0"><span>{d.name}</span>{d.dob_year && <span className="text-gray-400">{new Date().getFullYear() - d.dob_year} yrs</span>}</div>)}
                    </div>
                  )}
                  {detail.memberships.length > 0 && (
                    <div><div className="text-[11px] text-gray-400 mb-1">Campaigns</div>
                      {detail.memberships.map((m: any) => <div key={m.id} className="text-[12px]">{m.campaign_name} - {m.status}, step {m.current_step + 1}</div>)}
                    </div>
                  )}
                  <div><div className="text-[11px] text-gray-400 mb-1">Outreach & letters</div>
                    {detail.touches.length === 0 ? <div className="text-[12px] text-gray-400 bg-gray-50 rounded-lg p-2.5">No letters sent yet. Enrol this prospect in a campaign to send the first one.</div>
                    : detail.touches.slice(0, 8).map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 text-[12px]">
                          {t.channel === 'email' ? <Mail className="h-3.5 w-3.5 text-gray-400" /> : t.channel === 'letter' ? <FileText className="h-3.5 w-3.5 text-gray-400" /> : <PhoneCall className="h-3.5 w-3.5 text-gray-400" />}
                          <span className="flex-1 truncate">{t.channel === 'letter' ? 'Letter' : t.channel === 'email' ? (t.subject ?? 'Email') : 'Call task'}</span>
                          <span className={'text-[10px] px-1.5 py-0.5 rounded-full ' + (t.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : t.status === 'needs_approval' ? 'bg-amber-50 text-amber-700' : t.status === 'approved' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500')}>{t.status === 'sent' ? 'sent ' + (t.sent_at ? new Date(t.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '') : t.status.replace('_', ' ')}</span>
                        </div>
                      ))}
                    <div className="flex gap-2 flex-wrap mt-2.5">
                      {detail.prospect.owner_phone && <a className={btnGhost} href={'tel:' + detail.prospect.owner_phone}><PhoneCall className="h-3.5 w-3.5" />Call {detail.prospect.owner_phone}</a>}
                      <button className={btnGhost} onClick={() => { setNoteMode('call'); setNoteText(''); }}>Log a call</button>
                      <button className={btnGhost} onClick={() => { setNoteMode('note'); setNoteText(''); }}>Add note</button>
                    </div>
                    {noteMode && (
                      <div className="mt-2.5 bg-gray-50 rounded-lg p-3">
                        <div className="text-[11px] font-semibold text-gray-600 mb-1.5">{noteMode === 'call' ? 'What happened on the call?' : 'Note'}</div>
                        <textarea className={input__ + ' w-full min-h-[70px] mb-2'} placeholder={noteMode === 'call' ? 'e.g. Spoke to Patrick. Open to a conversation after year end, call back in November.' : 'Anything worth remembering…'} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus />
                        <div className="flex gap-2"><button className={btnGold} disabled={busy === 'note' || !noteText.trim()} onClick={saveNote}>{busy === 'note' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button><button className={btnGhost} onClick={() => setNoteMode(null)}>Cancel</button></div>
                      </div>
                    )}
                  </div>
                  {detail.prospect.notes && <div><div className="text-[11px] text-gray-400 mb-1">Notes & call log</div><div className="text-[12px] text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{detail.prospect.notes}</div></div>}
                </div>
                {detail.prospect.stage !== 'promoted' && detail.prospect.stage !== 'suppressed' && (
                  <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-wrap sticky bottom-0 bg-white">
                    <button disabled={!!busy} onClick={() => promote(detail.prospect.id)} className={btnGold}><ArrowUpRight className="h-4 w-4" />Promote to deal</button>
                    <button disabled={!!busy} onClick={() => markReplied(detail.prospect.id)} className={btnGhost}>Mark replied</button>
                    <button disabled={!!busy} onClick={() => suppress(detail.prospect.id)} className={btnGhost + ' text-red-600 border-red-200 hover:bg-red-50'}>Suppress</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {uploadOpen && <UploadModal onClose={() => { setUploadOpen(false); load(); }} setErr={setErr} />}
    </>
  );
}

// ============================ UPLOAD ============================
function UploadModal({ onClose, setErr }: { onClose: () => void; setErr: (s: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
  const [proposal, setProposal] = useState<any>(null); const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(''); const [report, setReport] = useState<any>(null);
  const FIELDS = ['company_name','company_number','website','owner_name','owner_email','owner_phone','address','postcode','region','sic_code','revenue','staff','notes'];
  const pick = async (f: File) => {
    setErr(''); setReport(null); setProposal(null);
    const text = await f.text(); setCsv(text); setFileName(f.name); setBusy('propose');
    try { const r = await ingestPropose(text, f.name); setProposal(r); setMapping(r.mapping); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const [gdprOk, setGdprOk] = useState(false);
  const commit = async () => { setBusy('commit'); try { setReport(await ingestCommit(csv, mapping, proposal?.job_id ?? null, fileName, true)); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  return (
    <div className="fixed inset-0 z-[65] bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-1"><h3 className="font-bold text-gray-900">Upload a list</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button></div>
        <p className="text-[13px] text-gray-500 mb-4">Broker sheets, data-provider exports, your own research. We map the columns, de-duplicate, and merge without overwriting good data. <b>Uploaded records stay yours.</b></p>
        {!proposal && (
          <button onClick={() => fileRef.current?.click()} disabled={busy === 'propose'} className="w-full border-2 border-dashed border-gray-300 rounded-xl p-10 text-gray-400 hover:border-[#0A2540]/50 hover:text-gray-600 text-sm flex items-center justify-center gap-2">
            {busy === 'propose' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading and mapping your file…</> : <><Upload className="h-4 w-4" /> Drop or choose a CSV file</>}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        {proposal && !report && (
          <>
            <p className="text-[13px] text-gray-600 mb-2">{fileName} · {proposal.rows_total} rows. Check the mapping:</p>
            <div className="flex flex-col gap-1.5 mb-4 max-h-60 overflow-y-auto">
              {proposal.headers.map((h: string) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-700 w-48 truncate">{h}</span>
                  <select className={input__ + ' flex-1'} value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value || null }))}>
                    <option value="">- ignore -</option>{FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2.5 text-[12.5px] text-gray-600 bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2.5 mb-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={gdprOk} onChange={(e) => setGdprOk(e.target.checked)} />
              <span>I confirm this list comes from a GDPR-compliant source and I have a lawful basis to contact these businesses. Rows matching companies already in your pipeline or active on the platform will be removed automatically, and the rest are enriched from the official register.</span>
            </label>
            <button onClick={commit} disabled={busy === 'commit' || !gdprOk} className={btnGold}>{busy === 'commit' && <Loader2 className="h-4 w-4 animate-spin" />}Import {proposal.rows_total} rows</button>
          </>
        )}
        {report && (
          <div className="bg-gray-50 rounded-xl p-4 text-[13px] text-gray-700">
            <b>{report.created}</b> new prospects · <b>{report.merged}</b> merged into existing records · {report.skipped} skipped.
            {report.enriched > 0 && <div className="text-emerald-700 mt-1"><b>{report.enriched}</b> matched to the official register and enriched with company number, SIC, address and age.</div>}
            {(report.excluded_pipeline > 0 || report.excluded_platform > 0) && (
              <div className="text-gray-500 mt-1">
                {report.excluded_pipeline > 0 && <span><b>{report.excluded_pipeline}</b> removed: already in your pipeline. </span>}
                {report.excluded_platform > 0 && <span><b>{report.excluded_platform}</b> removed: already active on the platform, so approaching them again would step on live conversations.</span>}
              </div>
            )}
            {report.errors?.length > 0 && <div className="text-amber-600 mt-1">{report.errors.length} rows had issues.</div>}
            <div className="mt-3"><button onClick={onClose} className={btnPrimary}>Done</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================ TASKS (origination) ============================
// Each AI-generated task carries an action key: the button either takes the
// user straight to the fix, or opens the exact flow that does it for them.
const TASK_ACTION_LABEL: Record<string, string> = {
  topup_letters: 'Top up letter credits',
  topup_ai: 'Top up AI credits',
  approve_letters: 'Open the approval queue',
  enrol_prospects: 'Enrol prospects now',
  start_sourcing: 'Start a sourcing run',
  move_replied_to_pipeline: 'Review replies',
  review_dealflow: 'Open the deal flow',
  upgrade_plan: 'See plans',
};
function ContactsView({ setErr, go }: { setErr: (s: string) => void; go: (v: any) => void }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [tf, setTf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = async () => { setLoading(true); try { const r = await crmList(); setTasks((r.tasks || []).filter((t: any) => !t.deal_id)); } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const addTask = async () => { if (!tf.title?.trim()) return; setBusy('t'); try { await crmAddTask({ title: tf.title, due_date: tf.due || null }); setTf({}); await load(); } finally { setBusy(''); } };
  const done = async (id: string) => { await crmCompleteTask(id); setTasks((t) => t.filter((x) => x.id !== id)); };
  const aiPlan = async () => {
    setBusy('ai'); try {
      const r = await crmAiTasks();
      if (r.created === 0) setErr('Nothing new to suggest. Your open tasks already cover the priorities.');
      await load();
    } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const overdue = (t: any) => t.due_date && new Date(t.due_date) < new Date();
  const runAction = (a: string) => {
    if (a === 'topup_letters') window.dispatchEvent(new CustomEvent('oi:topup', { detail: { kind: 'letter' } }));
    else if (a === 'topup_ai') window.dispatchEvent(new CustomEvent('oi:topup', { detail: { kind: 'ai' } }));
    else if (a === 'upgrade_plan') window.dispatchEvent(new Event('oi:paywall'));
    else if (a === 'review_dealflow') window.location.href = '/deals';
    else if (a === 'move_replied_to_pipeline') go('prospects');
    else if (a === 'start_sourcing') go('find');
    else go('campaigns');
  };
  return (
    <>
      <Header title="Tasks" sub="Your AI chief of staff watches campaigns, credits and pipeline in the background and writes tasks here when something needs you, with an email so nothing slips. Call tasks from campaigns land here too, plus anything you add yourself.">
        <button onClick={aiPlan} disabled={busy === 'ai'} className={btnGold}>{busy === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy === 'ai' ? 'Reading your workspace…' : 'AI: plan my next moves'}</button>
      </Header>
      <div className="px-8 pb-8 max-w-3xl">
        <div className={card + ' p-5'}>
          <div className="font-semibold text-gray-900 mb-3">Needs you <span className="text-gray-400 font-normal">· {tasks.length} open · origination only</span></div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-300" /> : tasks.length === 0 ? (
            <div className="text-[13px] text-gray-400 bg-gray-50 rounded-lg px-4 py-3">Nothing outstanding. Call tasks appear here automatically when a campaign reaches its call step.</div>
          ) : tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
              <button onClick={() => done(t.id)} className="mt-0.5 text-gray-300 hover:text-emerald-500" title="Mark done"><Check className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-gray-800">{t.title}{t.meta?.auto && <span className="ml-1.5 inline-flex text-[9px] font-bold bg-[#FFD700]/20 text-[#8a6d00] border border-[#FFD700]/50 rounded-full px-1.5 py-px uppercase align-middle">AI</span>}</div>
                <div className={'text-[11px] ' + (overdue(t) ? 'text-red-500 font-semibold' : 'text-gray-400')}>{[t.contact_name, t.due_date ? (overdue(t) ? 'overdue · was due ' : 'due ') + String(t.due_date).slice(0, 10) : null].filter(Boolean).join(' · ') || 'no due date'}</div>
                {t.meta?.action === 'approve_reply' && t.meta?.draft ? (
                  <button onClick={async () => { if (window.confirm('Send this reply?\n\nTo: ' + t.meta.draft.to + '\nSubject: ' + (t.meta.draft.subject ?? '') + '\n\n' + t.meta.draft.body)) { try { await crmApproveReply(t.id); await load(); } catch (e: any) { setErr(e.message || String(e)); } } }} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#0A2540] bg-[#FFD700] hover:brightness-95 rounded-full px-3 py-1">Review and send →</button>
                ) : t.meta?.action && TASK_ACTION_LABEL[t.meta.action] ? (
                  <button onClick={() => runAction(t.meta.action)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#0A2540] bg-[#FFD700] hover:brightness-95 rounded-full px-3 py-1">{TASK_ACTION_LABEL[t.meta.action]} →</button>
                ) : null}
                {t.meta?.action === 'call_or_manual' && (
                  <div className="mt-1 text-[11px] text-gray-500">This one needs you in person. The brief above tells you exactly what to do; mark it done when it is.</div>
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-4">
            <input className={input__ + ' flex-1'} placeholder="Add a task…" value={tf.title ?? ''} onChange={(e) => setTf((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
            <input type="date" className={input__} value={tf.due ?? ''} onChange={(e) => setTf((f) => ({ ...f, due: e.target.value }))} />
            <button onClick={addTask} disabled={busy === 't'} className={btnPrimary}>Add</button>
          </div>
        </div>
      </div>
    </>
  );
}

// Enrolment: show exactly who will enter the sequence before anything happens.
function EnrolPanel({ campaign, credits, busy, onEnrol, setErr }: { campaign: any; credits: any; busy: boolean; onEnrol: (ids: string[]) => void; setErr: (s: string) => void }) {
  const [f, setF] = useState<{ min_fit: string; region: string; provenance: string }>({ min_fit: '', region: '', provenance: '' });
  const [raw, setRaw] = useState<any[] | null>(null);
  const [inCampaign, setInCampaign] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    prospectsList({ per: 200 }).then((r) => {
      if (!live) return;
      const avail = r.prospects.filter((x: any) => !['suppressed', 'disqualified', 'in_campaign'].includes(x.stage));
      setInCampaign(r.prospects.filter((x: any) => x.stage === 'in_campaign').length);
      setRaw(avail); setSel(new Set(avail.map((x: any) => x.id)));
    }).catch((e) => { setErr(e.message || String(e)); setRaw([]); });
    return () => { live = false; };
  }, []);
  const cands = raw === null ? null : raw.filter((x: any) => {
    if (f.min_fit && !(Number(x.fit_score ?? -1) >= Number(f.min_fit))) return false;
    if (f.region.trim()) { const q = f.region.trim().toLowerCase(); if (!(String(x.region ?? '').toLowerCase().includes(q) || String(x.postcode ?? '').toLowerCase().startsWith(q))) return false; }
    if (f.provenance && x.provenance !== f.provenance) return false;
    return true;
  });
  const hidden = raw && cands ? raw.length - cands.length : 0;
  useEffect(() => { if (cands) setSel(new Set(cands.map((x: any) => x.id))); }, [f.min_fit, f.region, f.provenance]);
  const toggle = (id: string, on: boolean) => setSel((s_) => { const n = new Set(s_); on ? n.add(id) : n.delete(id); return n; });
  const firstIsLetter = true; // register-sourced sequences open with a letter
  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-4">
      <div className="flex gap-2 items-center flex-wrap">
        <select className={input__} value={f.min_fit} onChange={(e) => setF((x) => ({ ...x, min_fit: e.target.value }))}><option value="">Any fit score</option><option value="60">Fit 60+</option><option value="80">Fit 80+</option></select>
        <input className={input__ + ' w-40'} placeholder="Region or postcode" value={f.region} onChange={(e) => setF((x) => ({ ...x, region: e.target.value }))} />
        <select className={input__} value={f.provenance} onChange={(e) => setF((x) => ({ ...x, provenance: e.target.value }))}>
          <option value="">Any source</option><option value="platform">Register-sourced</option><option value="funnel">Seller funnel</option><option value="uploaded">Your uploads</option><option value="meta">Meta leads</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          {cands && <span className="text-[12px] text-gray-500"><b className="text-gray-800">{sel.size}</b> of {cands.length} selected{hidden > 0 ? ' · ' + hidden + ' hidden by filters' : ''}{inCampaign > 0 ? ' · ' + inCampaign + ' already in campaigns' : ''}</span>}
          <button onClick={() => onEnrol([...sel])} disabled={busy || sel.size === 0} className={btnGold}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Enrol {sel.size || ''} into {campaign.name}</button>
        </div>
      </div>
      {!cands ? <div className="p-6 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div> : cands.length === 0 ? (
        <div className="p-5 text-[12.5px] text-gray-500">
          {hidden > 0 ? hidden + ' available prospects are hidden by your filters - clear them above.' : inCampaign > 0 ? 'All ' + inCampaign + ' of your prospects are already in a campaign. Source more from Find companies or upload a list.' : 'No available prospects yet. Source from Find companies or upload a list.'}
        </div>
      ) : (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          <label className="flex items-center gap-3 px-3 py-2 text-[12px] font-semibold text-gray-500 bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={sel.size === cands.length} onChange={(e) => setSel(e.target.checked ? new Set(cands.map((x: any) => x.id)) : new Set())} />
            Select all shown
          </label>
          {cands.map((pr: any) => (
            <label key={pr.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px] cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={sel.has(pr.id)} onChange={(e) => toggle(pr.id, e.target.checked)} />
              <span className="font-semibold text-gray-800">{pr.company_name}</span>
              <span className="text-gray-400">{pr.region ?? pr.postcode ?? ''}</span>
              <span className="text-gray-400">{pr.provenance === 'platform' ? 'register' : pr.provenance}</span>
              {pr.fit_score != null && <span className="ml-auto text-[11px] font-bold bg-[#0A2540] text-white px-2 py-0.5 rounded-full">fit {pr.fit_score}</span>}
            </label>
          ))}
        </div>
      )}
      <div className="text-[11.5px] text-gray-400 mt-2.5">
        Enrolling queues their first step for your approval. Nothing posts until you approve it{firstIsLetter ? ', and each approved letter uses one letter credit' : ''}{credits ? ` (you have ${credits.letter} left)` : ''}. Prospects already in a campaign are not shown.
      </div>
    </div>
  );
}

function CampaignsView({ setErr, buyBox, profile, goAbout }: { setErr: (s: string) => void; buyBox: any; profile?: any; goAbout?: () => void }) {
  const [camps, setCamps] = useState<any[]>([]); const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const [draftSteps, setDraftSteps] = useState<any[]>([]); const [queue, setQueue] = useState<any[] | null>(null);
  const [enrolFor, setEnrolFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [credits, setCredits] = useState<any>(null);
  const loadCredits = () => creditsBalance().then(setCredits).catch(() => {});
  const [showMethod, setShowMethod] = useState(() => { try { return localStorage.getItem('oi_method_seen') !== '1'; } catch { return true; } });
  const dismissMethod = () => { setShowMethod(false); try { localStorage.setItem('oi_method_seen', '1'); } catch (_) {} };
  const CHANNEL_LABEL: Record<string, string> = { letter: 'Letter (posted)', email: 'Email', call_task: 'Call task (human)' };
  const CHANNEL_ICON: Record<string, any> = { letter: FileText, email: Mail, call_task: PhoneCall };

  const [touchStats, setTouchStats] = useState<Record<string, { approved: number; letters_approved: number }>>({});
  const load = async () => {
    setLoading(true);
    try {
      const r = await outreachList(); setCamps(r.campaigns); setSteps(r.steps);
      try {
        const q = await outreachQueue();
        const st: Record<string, { approved: number; letters_approved: number }> = {};
        for (const t of q.touches) {
          if (t.status !== 'approved') continue;
          st[t.campaign_id] = st[t.campaign_id] ?? { approved: 0, letters_approved: 0 };
          st[t.campaign_id].approved++;
          if (t.channel === 'letter') st[t.campaign_id].letters_approved++;
        }
        setTouchStats(st);
      } catch (_) { /* counts are a nicety */ }
    } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); loadCredits(); }, []);
  const aiDraft = async () => { if (!gate('ai')) return; setBusy('draft'); setErr(''); try { const r = await outreachDraftTemplates(buyBox ? { buy_box: buyBox } : undefined); setDraftSteps(r.steps); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const create = async () => {
    if (!name.trim() || !draftSteps.length) { setErr('Name the campaign and draft the sequence first'); return; }
    setBusy('create'); try { await outreachCreate({ name, steps: draftSteps }); setCreating(false); setName(''); setDraftSteps([]); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const setStatus = async (id: string, status: string) => { if (status === 'active' && !gate('letter')) return; setBusy(id); try { await outreachUpdate(id, { status }); await load(); } finally { setBusy(''); } };
  // Free workspaces with purchased letter credits may run campaigns on their
  // own lists: pay as you go. Otherwise offer the choice of plan or credits.
  const gate = (kind: 'letter' | 'ai' = 'letter') => {
    if (CURRENT_PLAN !== 'free') return true;
    if (credits && (kind === 'letter' ? credits.letter : credits.ai) > 0) return true;
    window.dispatchEvent(new Event('oi:unlock'));
    return false;
  };
  const enrol = async (id: string, ids: string[]) => {
    if (!gate('letter')) return;
    setBusy('enrol'); try {
      const r = await outreachEnrol(id, { prospect_ids: ids, limit: ids.length });
      alert(`${r.enrolled} prospects enrolled (${r.suppressed} suppressed). Their first step now sits in your approval queue.`);
      setEnrolFor(null); await load(); loadCredits();
    } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const showQueue = async () => { setBusy('queue'); try { const r = await outreachQueue('needs_approval'); setQueue(r.touches); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const creditErr = (e: any): boolean => {
    const m = String(e?.message ?? e);
    if (/insufficient_credits/.test(m)) { window.dispatchEvent(new CustomEvent('oi:topup', { detail: { kind: 'letter' } })); return true; }
    return false;
  };
  const approveAll = async () => { if (!gate('letter')) return;
    setBusy('approve'); try { const r = await outreachApproveAll(); alert(`${r.approved} messages approved. They send inside each campaign's window and daily cap.`); setQueue(null); await load(); }
    catch (e: any) { if (!creditErr(e)) setErr(e.message || String(e)); } finally { setBusy(''); loadCredits(); } };
  const runNow = async () => { if (!gate('letter')) return; setBusy('run'); try { await outreachRun(); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };

  return (
    <>
      <Header title="Campaigns" sub="Register-sourced prospects are letters-only until they reply - a rejected cold email burns that owner for good, a letter never does. Your own uploads, funnel enquiries and Meta leads can be emailed from day one. Calls unlock once anyone engages. Nothing sends until you approve it.">
        <button onClick={showQueue} disabled={!!busy} className={btnGhost}><Check className="h-4 w-4" />Approval queue{camps.reduce((t, c) => t + (c.needs_approval ?? 0), 0) > 0 ? ` · ${camps.reduce((t, c) => t + (c.needs_approval ?? 0), 0)}` : ''}</button>
        <button onClick={runNow} disabled={!!busy} title="Approved messages post automatically every 15 minutes inside each campaign's send window. This just skips the wait." className={btnGhost}>{busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Send approved now</button>
        <button onClick={() => setCreating((c) => !c)} className={btnGold}><Send className="h-4 w-4" />New campaign</button>
      </Header>
      <div className="px-8 pb-8">
        {profile !== undefined && (!profile?.phone || !String(profile?.bio ?? '').trim()) && (
          <div className="flex items-center gap-2.5 bg-[#FFFDF2] border border-[#FFD700] rounded-xl px-4 py-2.5 mb-4 text-[12.5px] text-gray-700">
            <Sparkles className="h-4 w-4 text-[#C9A227] shrink-0" />
            <span>Your letters are formed from <b>About you</b>{!profile?.phone ? ' and your phone number goes under every sign-off' : ''}. It takes two minutes and lifts reply rates more than anything else.</span>
            <button className="ml-auto font-bold text-[#0A2540] underline underline-offset-2 shrink-0" onClick={goAbout}>Complete it →</button>
          </div>
        )}
        {credits && (
          <div className="flex items-center gap-3 flex-wrap mb-4 text-[12.5px]">
            <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold border ' + (credits.letter <= 5 ? 'bg-red-50 border-red-200 text-red-700' : credits.letter <= 20 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-700')}>
              <Mail className="h-3.5 w-3.5" /> {credits.letter} letter credits left
            </span>
            <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold border ' + (credits.ai <= 5 ? 'bg-red-50 border-red-200 text-red-700' : credits.ai <= 20 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200 text-gray-700')}>
              <Sparkles className="h-3.5 w-3.5" /> {credits.ai} AI credits left
            </span>
            <span className="text-gray-400">One letter credit per letter posted. Monthly allowance resets on the 1st.</span>
            <button className="font-bold text-[#0A2540] underline underline-offset-2" onClick={() => window.dispatchEvent(new CustomEvent('oi:topup', { detail: { kind: 'letter' } }))}>Top up</button>
            <button className="font-bold text-[#0A2540] underline underline-offset-2" onClick={() => window.dispatchEvent(new Event('oi:paywall'))}>Upgrade plan</button>
          </div>
        )}
        {showMethod && (
          <div className="rounded-2xl p-6 mb-5 text-white" style={{ background: 'linear-gradient(120deg,#0A2540,#0E3257)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[#FFD700] font-serif font-bold text-[17px]">Why this method finds deals nobody else sees</div>
                <div className="grid sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <div className="text-[#FFD700] text-[12px] font-bold uppercase tracking-wide mb-1">1 · A letter on the desk</div>
                    <p className="text-white/75 text-[12.5px] leading-relaxed">Owners in their 60s do not answer cold emails or LinkedIn. A short, personal letter from a named buyer lands on their desk where nothing else does. Reply rates run 3-8% against under 1% for email.</p>
                  </div>
                  <div>
                    <div className="text-[#FFD700] text-[12px] font-bold uppercase tracking-wide mb-1">2 · The follow-up rhythm</div>
                    <p className="text-white/75 text-[12.5px] leading-relaxed">Ten days later a short email, then a call brief for you. The engine paces every step, honours opt-outs, and nothing ever sends until you approve it. One letter credit per letter posted.</p>
                  </div>
                  <div>
                    <div className="text-[#FFD700] text-[12px] font-bold uppercase tracking-wide mb-1">3 · You are first in the room</div>
                    <p className="text-white/75 text-[12.5px] leading-relaxed">When an owner replies, they reply to you alone. No broker, no auction, no listing. That is where fair prices and vendor-financed structures get agreed.</p>
                  </div>
                </div>
              </div>
              <button onClick={dismissMethod} className="text-white/40 hover:text-white/80 shrink-0" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        {creating && (
          <div className={card + ' p-5 mb-5'}>
            <div className="flex gap-2 mb-3">
              <input className={input__ + ' flex-1'} placeholder="Campaign name, e.g. Laundries North West Q3" value={name} onChange={(e) => setName(e.target.value)} />
              <button onClick={aiDraft} disabled={busy === 'draft'} className={btnPrimary}>{busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy === 'draft' ? 'Writing in your voice…' : 'Draft sequence with AI'}</button>
            </div>
            {draftSteps.map((s, i) => {
              const Icon = CHANNEL_ICON[s.channel];
              return (
                <div key={i} className="mb-3 bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-2"><Icon className="h-4 w-4" /><b className="text-gray-700">Step {i + 1} · {CHANNEL_LABEL[s.channel]}</b>{s.wait_days ? `· ${s.wait_days} days after previous` : '· immediately'}</div>
                  {s.subject != null && s.channel === 'email' && <input className={input__ + ' w-full mb-2'} value={s.subject} onChange={(e) => setDraftSteps((d) => d.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />}
                  <textarea className={input__ + ' w-full min-h-[100px]'} value={s.body} onChange={(e) => setDraftSteps((d) => d.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
                </div>
              );
            })}
            {draftSteps.length > 0 && <button onClick={create} disabled={busy === 'create'} className={btnGold}>{busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />}Create campaign (starts paused)</button>}
          </div>
        )}
        {queue && (
          <div className={card + ' p-5 mb-5'}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-gray-900">{queue.length} messages waiting for approval</div>
              <div className="flex gap-2"><button onClick={approveAll} disabled={!queue.length || !!busy} className={btnGold}><Check className="h-4 w-4" />Approve all</button><button onClick={() => setQueue(null)} className={btnGhost}>Close</button></div>
            </div>
            {credits && (() => { const letters = queue.filter((t: any) => t.channel === 'letter').length; if (!letters) return null; const short = letters > credits.letter; return (
              <div className={'text-[12px] rounded-lg px-3 py-2 mb-3 ' + (short ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600')}>
                {letters} of these are letters. You have <b>{credits.letter}</b> letter credits.
                {short && <span> Approving all will stop at {credits.letter}. <button className="font-bold underline" onClick={() => window.dispatchEvent(new CustomEvent('oi:topup', { detail: { kind: 'letter' } }))}>Top up</button> or <button className="font-bold underline" onClick={() => window.dispatchEvent(new Event('oi:paywall'))}>upgrade</button> to send the rest.</span>}
              </div>
            ); })()}
            <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
              {queue.map((t) => (
                <div key={t.id} className="bg-gray-50 rounded-lg p-3 text-[12px]">
                  <div className="flex items-center gap-2 mb-1"><b className="text-gray-800">{t.company_name}</b><span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">{t.channel}</span>
                    <button onClick={() => setPreview(t)} className="ml-auto text-[#0A2540] hover:underline font-semibold">{t.channel === 'letter' ? 'Preview letter' : 'Preview'}</button>
                    <button onClick={async () => { if (!gate(t.channel === 'letter' ? 'letter' : 'ai')) return; try { await outreachApprove([t.id]); setQueue((q) => q!.filter((x) => x.id !== t.id)); loadCredits(); } catch (e: any) { if (!creditErr(e)) setErr(e.message || String(e)); } }} className="text-emerald-600 hover:text-emerald-700 font-semibold">Approve</button></div>
                  {t.subject && <div className="text-gray-600 font-medium">{t.subject}</div>}
                  <div className="text-gray-500 line-clamp-2 whitespace-pre-wrap">{t.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading ? <div className="text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : camps.length === 0 && !creating ? (
          <div className={card + ' p-12 text-center text-gray-400'}>
            <Send className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <div className="text-gray-600 font-medium mb-1">No campaigns yet</div>
            <div className="text-[13px] mb-4">The proven recipe: a personal letter, a short follow-up email ten days later, then a phone call. The AI drafts all three from your buy box.</div>
            <button onClick={() => setCreating(true)} className={btnGold}><Send className="h-4 w-4" />Create your first campaign</button>
          </div>
        ) : camps.map((c) => (
          <div key={c.id} className={card + ' p-5 mb-3'}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={'h-2.5 w-2.5 rounded-full ' + (c.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300')} />
              <b className="text-[14px] text-gray-900">{c.name}</b>
              <span className="text-[12px] text-gray-400">{c.members} enrolled · {c.sent} sent · {c.replied} replied</span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setEnrolFor(enrolFor === c.id ? null : c.id)} className={btnGhost}>Enrol prospects</button>
                {c.status !== 'active' ? <button onClick={() => setStatus(c.id, 'active')} disabled={busy === c.id} className={btnPrimary}>Activate</button>
                  : <button onClick={() => setStatus(c.id, 'paused')} disabled={busy === c.id} className={btnGhost}>Pause</button>}
              </div>
            </div>
            {(c.needs_approval > 0 || (touchStats[c.id]?.approved ?? 0) > 0) && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {c.needs_approval > 0 && (
                  <button onClick={showQueue} className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-3 py-1 hover:bg-amber-100">
                    {c.needs_approval} waiting for your approval - nothing sends until you say so
                  </button>
                )}
                {(touchStats[c.id]?.approved ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1">
                    {touchStats[c.id].approved} approved and scheduled - posts automatically {(c.send_window ?? '09:00-17:00')} UK, up to {c.daily_cap ?? 25} a day
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[12px] text-gray-400 mt-2">
              {steps.filter((s) => s.campaign_id === c.id).map((s, i, arr) => {
                const Icon = CHANNEL_ICON[s.channel];
                return <span key={s.id} className="flex items-center gap-1.5"><span className="flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1 text-gray-600"><Icon className="h-3 w-3" />{CHANNEL_LABEL[s.channel]}{s.wait_days ? ` +${s.wait_days}d` : ''}</span>{i < arr.length - 1 && <ChevronRight className="h-3 w-3" />}</span>;
              })}
            </div>
            {enrolFor === c.id && (
              <EnrolPanel campaign={c} credits={credits} busy={busy === 'enrol'} onEnrol={(ids) => enrol(c.id, ids)} setErr={setErr} />
            )}
          </div>
        ))}
      </div>
      {preview && <LetterPreview touch={preview} credits={credits} onClose={() => setPreview(null)}
        onSaved={(t: any) => { setQueue((q) => q ? q.map((x) => x.id === t.id ? { ...x, body: t.body, subject: t.subject } : x) : q); setPreview((p: any) => ({ ...p, body: t.body, subject: t.subject })); }}
        onApprove={async () => { if (!gate(preview.channel === 'letter' ? 'letter' : 'ai')) return; try { await outreachApprove([preview.id]); setQueue((q) => q!.filter((x) => x.id !== preview.id)); setPreview(null); loadCredits(); } catch (e: any) { if (!creditErr(e)) setErr(e.message || String(e)); } }} />}
    </>
  );
}

// The letter exactly as it will print: A4 sheet, address block, date, body,
// and the contact details that are stamped on at send time. Editable in place.
function LetterPreview({ touch, credits, onClose, onSaved, onApprove }: { touch: any; credits: any; onClose: () => void; onSaved: (t: any) => void; onApprove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(touch.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isLetter = touch.channel === 'letter';
  const save = async (apply?: 'campaign') => {
    setBusy(true); setErr('');
    try {
      const r: any = await outreachUpdateTouch(touch.id, apply ? ({ body, apply } as any) : { body });
      onSaved(r.touch);
      if (apply && r.applied != null) alert(`Saved. ${r.applied} other unsent letter${r.applied === 1 ? '' : 's'} in this campaign updated with each owner's own details.`);
      setEditing(false);
    }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-serif font-bold text-lg">{isLetter ? 'Letter preview' : 'Email preview'} <span className="text-white/50 text-[13px] font-sans font-normal">· {touch.company_name}</span></div>
          <div className="flex gap-2">
            {!editing && <button className={btnGhost + ' !text-white !border-white/30 hover:!bg-white/10'} onClick={() => setEditing(true)}>Edit</button>}
            {editing && <button className={btnGhost + ' !text-white !border-white/30 hover:!bg-white/10'} disabled={busy} onClick={() => save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save this letter'}</button>}
            {editing && <button className={btnGhost + ' !text-white !border-[#FFD700]/60 hover:!bg-white/10'} disabled={busy} onClick={() => save('campaign')} title="Updates the campaign template and every unsent letter, keeping each owner's own name and details">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save for all unsent'}</button>}
            <button className={btnGold} onClick={onApprove}><Check className="h-4 w-4" />Approve{isLetter ? ' · 1 letter credit' : ''}</button>
            <button className="text-white/50 hover:text-white px-2" onClick={onClose}><X className="h-5 w-5" /></button>
          </div>
        </div>
        {err && <div className="bg-red-50 text-red-700 text-[13px] rounded-lg px-3 py-2 mb-3">{err}</div>}
        <div className="bg-white rounded-sm shadow-2xl mx-auto" style={{ maxWidth: 640, minHeight: 860, padding: '64px 72px', fontFamily: 'Georgia, serif' }}>
          <div className="flex justify-between text-[12px] text-gray-500" style={{ fontFamily: 'Georgia, serif' }}>
            <div>
              {touch.company_name && <div className="font-semibold text-gray-800">{touch.owner_name || 'The Business Owner'}</div>}
              <div>{touch.company_name}</div>
              {touch.address && <div>{touch.address}</div>}
              {touch.postcode && <div>{touch.postcode}</div>}
            </div>
            <div className="text-right">{today}</div>
          </div>
          {editing ? (
            <textarea className="w-full mt-8 text-[14px] leading-[1.8] text-gray-900 outline-none border border-dashed border-gray-300 rounded p-3 min-h-[560px]" style={{ fontFamily: 'Georgia, serif' }} value={body} onChange={(e) => setBody(e.target.value)} />
          ) : (
            <div className="mt-8 text-[14px] leading-[1.8] text-gray-900 whitespace-pre-wrap">{body}</div>
          )}
          <div className="mt-6 pt-4 border-t border-gray-100 text-[12px] text-gray-400">
            Your phone, email and website from About you are added under the sign-off automatically when the letter posts.
          </div>
        </div>
        {isLetter && credits && <div className="text-center text-white/40 text-[12px] mt-3">{credits.letter} letter credits available · posts inside the campaign send window at Stannp's next run</div>}
      </div>
    </div>
  );
}

// ============================ FUNNEL ============================
function FunnelView({ setErr, settings, onSaved }: { setErr: (s: string) => void; settings: any; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(settings?.funnel?.slug ?? '');
  const [headline, setHeadline] = useState(settings?.funnel?.headline ?? '');
  const [verifyTok, setVerifyTok] = useState(settings?.funnel?.meta_verify_token ?? '');
  const apiBase = ((import.meta as any).env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1/acq-funnel';
  const pageUrl = window.location.origin + '/f' + (slug ? '/' + encodeURIComponent(slug) : '');
  const save = async () => {
    setBusy(true); setErr('');
    try { await setOrgSettings({ ...(settings ?? {}), funnel: { ...(settings?.funnel ?? {}), slug: slug || undefined, headline: headline || undefined, meta_verify_token: verifyTok || undefined } }); onSaved(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Funnel & Meta ads" sub="Your always-on inbound channel. A branded 'Thinking of selling?' page plus Meta lead ads, both feeding straight into Prospects." />
      <div className="px-8 pb-8 grid lg:grid-cols-2 gap-5">
        <div className={card + ' p-5'}>
          <div className="font-semibold text-gray-900 mb-1">Your seller page</div>
          <p className="text-[13px] text-gray-500 mb-3">Use it in ads, letters, email signatures and QR codes. Enquiries arrive as qualified leads with an automatic confidential reply.</p>
          <div className="flex gap-2 mb-2">
            <input className={input__ + ' w-44'} placeholder="Link slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
            <input className={input__ + ' flex-1'} placeholder="Headline (optional)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 mb-3">
            <Globe className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-[13px] text-gray-700 break-all flex-1">{pageUrl}</span>
            <button onClick={() => navigator.clipboard.writeText(pageUrl)} className={btnGhost + ' !px-2.5'} title="Copy"><Copy className="h-3.5 w-3.5" /></button>
            <a href={pageUrl} target="_blank" rel="noreferrer" className={btnGhost}>Preview</a>
          </div>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
        </div>
        <div className={card + ' p-5'}>
          <div className="font-semibold text-gray-900 mb-1">Meta lead ads → straight into Prospects</div>
          <p className="text-[13px] text-gray-500 mb-3">Run "Thinking of selling your business?" instant-form ads on Facebook and Instagram. Leads flow in via webhook - no landing page needed.</p>
          <ol className="list-decimal list-inside text-[13px] text-gray-600 flex flex-col gap-1.5 mb-3">
            <li>Create a <b>Lead Ads</b> campaign with an instant form: business name, owner name, email, phone, area, rough turnover.</li>
            <li>Target your buy-box regions, ages 45–65, business-owner interests. Plain, personal creative beats stock photos.</li>
            <li>In the Meta App Dashboard add a <b>Webhooks</b> product → Page → subscribe to <b>leadgen</b> with the callback below.</li>
            <li>Save your Page ID and Page token in org settings so full lead details can be pulled.</li>
          </ol>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 mb-2">
            <span className="text-[12px] text-gray-700 break-all flex-1">{apiBase}</span>
            <button onClick={() => navigator.clipboard.writeText(apiBase)} className={btnGhost + ' !px-2.5'}><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex gap-2">
            <input className={input__ + ' flex-1'} placeholder="Webhook verify token" value={verifyTok} onChange={(e) => setVerifyTok(e.target.value)} />
            <button onClick={save} disabled={busy} className={btnPrimary}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================ BUY BOX ============================
function money2(n: any) { return n == null ? null : '\u00a3' + Number(n).toLocaleString(); }

function BuyBoxView({ openWizard, setErr, onChanged }: { openWizard: () => void; setErr: (s: string) => void; onChanged: () => void }) {
  const [boxes, setBoxes] = useState<any[] | null>(null);
  const [tax, setTax] = useState<Record<string, string>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const load = async () => { try { const r = await buyboxList(); setBoxes(r.boxes); } catch (e: any) { setErr(e.message || String(e)); } };
  useEffect(() => { load(); sourceTaxonomy().then((r) => setTax(Object.fromEntries(r.taxonomy.map((t) => [t.key, t.label])))).catch(() => {}); }, []);
  const activate = async (id: string) => { setBusy(id); try { await buyboxActivate(id); await load(); onChanged(); } finally { setBusy(''); } };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete buy box "${name}"? This cannot be undone.`)) return;
    setBusy(id); try { await buyboxDelete(id); await load(); onChanged(); } finally { setBusy(''); }
  };
  return (
    <>
      <Header title="Buy box" sub="The definition of what you buy - built with the Officially Invested method. Sourcing, fit scoring, campaign drafting and the funnel all read from whichever box is active. Run as many as you like.">
        <button onClick={openWizard} className={btnGhost}><Settings2 className="h-4 w-4" />Quick wizard</button>
        <button onClick={() => setChatOpen(true)} className={btnGold}><Sparkles className="h-4 w-4" />Build with the coach</button>
      </Header>
      <div className="px-8 pb-8">
        {boxes === null ? <div className="text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : boxes.length === 0 ? (
          <div className={card + ' p-12 text-center text-gray-400'}>
            <Target className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <div className="text-gray-600 font-medium mb-1">No buy box yet</div>
            <div className="text-[13px] mb-4 max-w-md mx-auto">The coach interviews you the way we teach it: your background, your capital and funding stack, your income goal, geography, risk filters. Five minutes, and everything in Origination starts working for you.</div>
            <button onClick={() => setChatOpen(true)} className={btnGold}><Sparkles className="h-4 w-4" />Build my buy box with the coach</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {boxes.map((b) => {
              const c = b.criteria ?? {};
              return (
                <div key={b.id} className={card + ' p-5 ' + (b.is_active ? 'ring-2 ring-[#FFD700]' : '')}>
                  <div className="flex items-center gap-2 mb-2">
                    <b className="text-[15px] text-gray-900">{b.name}</b>
                    {b.is_active ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0A2540] text-[#FFD700]">ACTIVE</span>
                      : <button disabled={!!busy} onClick={() => activate(b.id)} className="text-[11px] font-semibold text-gray-500 hover:text-[#0A2540] border border-gray-300 rounded-full px-2.5 py-0.5">Make active</button>}
                    <span className="text-[10px] text-gray-300 ml-auto">{b.created_from === 'chat' ? 'Coach-built' : 'Wizard'}</span>
                    <button disabled={!!busy} onClick={() => remove(b.id, b.name)} className="text-gray-300 hover:text-red-500" title="Delete"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {(c.industries ?? []).slice(0, 5).map((k: string) => <span key={k} className="text-[11px] px-2.5 py-1 rounded-full bg-[#0A2540] text-white">{tax[k] ?? k}</span>)}
                    {(c.industries ?? []).length > 5 && <span className="text-[11px] px-2 py-1 text-gray-400">+{(c.industries ?? []).length - 5} more</span>}
                    {(c.custom_industries ?? []).map((x: string) => <span key={x} className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{x}</span>)}
                  </div>
                  <div className="text-[12px] text-gray-500 flex flex-col gap-1">
                    <div>{[c.location ? `${c.location}${c.radius_miles ? ` (within ${c.radius_miles} mi)` : ''}` : null, (c.regions ?? []).join(', ') || null].filter(Boolean).join(' \u00b7 ') || 'UK-wide'}</div>
                    <div>{[money2(c.revenue_min) ? money2(c.revenue_min) + '+ revenue' : null, money2(c.profit_min) ? money2(c.profit_min) + '+ profit' : null, c.max_price ? 'up to ' + money2(c.max_price) : null].filter(Boolean).join(' \u00b7 ') || 'Any size'}</div>
                    <div>{[c.years_trading_min ? `${c.years_trading_min}+ yrs trading` : null, c.succession_pref !== false ? 'succession priority' : null, c.recurring_revenue_pref ? 'recurring revenue' : null, c.max_customer_concentration_pct ? `max ${c.max_customer_concentration_pct}% customer concentration` : null].filter(Boolean).join(' \u00b7 ')}</div>
                    {(c.hands_on_level || c.regulated_ok != null || (c.capital_sources ?? []).length > 0) && <div>{[c.hands_on_level ? c.hands_on_level.replace(/_/g, ' ') : null, c.regulated_ok ? 'open to regulated' : c.regulated_ok === false ? 'non-regulated only' : null, (c.capital_sources ?? []).length ? 'capital: ' + c.capital_sources.map((x: string) => x.replace(/_/g, '/')).join(', ') : null].filter(Boolean).join(' · ')}</div>}
                    {(c.exclusions ?? []).length > 0 && <div className="text-red-400">Avoids: {(c.exclusions ?? []).join(', ')}</div>}
                  </div>
                  {c.rationale && <div className="mt-2.5 text-[12px] text-gray-600 bg-gray-50 rounded-lg p-2.5 leading-relaxed">{c.rationale}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {chatOpen && <BuyBoxChat onClose={() => setChatOpen(false)} onSaved={async () => { setChatOpen(false); await load(); onChanged(); }} setErr={setErr} />}
    </>
  );
}

function BuyBoxChat({ onClose, onSaved, setErr }: { onClose: () => void; onSaved: () => void; setErr: (s: string) => void }) {
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, thinking, proposal]);
  useEffect(() => {
    setMsgs([{ role: 'assistant', content: "Let's build your buy box properly, the way we teach it. First: tell me about you. What's your background \u2014 what have you run, worked in, or know deeply? And roughly how much cash could you deploy into a deal?" }]);
  }, []);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next); setInput(''); setThinking(true); setErr('');
    try {
      const r = await buyboxChat(next.map((m) => ({ role: m.role, content: m.content })));
      setMsgs((m) => [...m, { role: 'assistant', content: r.message }]);
      if (r.complete && r.buy_box) setProposal(r.buy_box);
    } catch (e: any) { setErr(e.message || String(e)); } finally { setThinking(false); }
  };
  const save = async () => {
    setSaving(true);
    try { await buyboxCreate(proposal, { name: proposal.name ?? 'My buy box', created_from: 'chat', transcript: msgs }); onSaved(); }
    catch (e: any) { const m = e.message || String(e); if (/needs_upgrade|paid plans|Upgrade to add more/.test(m)) window.dispatchEvent(new Event('oi:paywall')); else setErr(m); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col" style={{ height: 'min(720px, 90vh)' }}>
        <div className="px-6 py-4 rounded-t-2xl flex items-center justify-between" style={{ background: NAVY }}>
          <div>
            <div className="text-[#FFD700] font-serif font-bold">The Buy Box coach</div>
            <div className="text-white/50 text-[11px]">Built on the Officially Invested frameworks - screening gates, RED, the funding stack</div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 bg-gray-50">
          {msgs.map((m, i) => (
            <div key={i} className={'max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ' + (m.role === 'user' ? 'self-end bg-[#0A2540] text-white rounded-br-md' : 'self-start bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm')}>{m.content}</div>
          ))}
          {thinking && <div className="self-start bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>}
          {proposal && (
            <div className="self-stretch bg-white border-2 border-[#FFD700] rounded-2xl p-4 shadow-sm">
              <div className="font-bold text-gray-900 text-[14px] mb-1">{proposal.name ?? 'Your buy box'}</div>
              <div className="text-[12px] text-gray-600 flex flex-col gap-1 mb-3">
                <div>{[proposal.location ? `${proposal.location}${proposal.radius_miles ? ` (within ${proposal.radius_miles} mi)` : ''}` : null, money2(proposal.profit_min) ? money2(proposal.profit_min) + '+ profit' : null, money2(proposal.revenue_min) ? money2(proposal.revenue_min) + '+ revenue' : null, proposal.max_price ? 'up to ' + money2(proposal.max_price) : null].filter(Boolean).join(' \u00b7 ')}</div>
                <div className="flex flex-wrap gap-1">{(proposal.industries ?? []).map((k: string) => <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-[#0A2540] text-white">{k.replace(/_/g, ' ')}</span>)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className={btnGold}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save & make active</button>
                <button onClick={() => { setProposal(null); }} className={btnGhost}>Keep refining</button>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <textarea className={input__ + ' flex-1 resize-none'} rows={2} placeholder="Type your answer - or paste your CV / LinkedIn experience…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} autoFocus />
          <button onClick={() => send()} disabled={thinking || !input.trim()} className={btnPrimary}><Send className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

// ============================ ABOUT YOU (buyer profile) ============================
function AboutView({ settings, onSaved, setErr }: { settings: any; onSaved: () => void; setErr: (s: string) => void }) {
  const pr = settings?.profile ?? {};
  const [f, setF] = useState<Record<string, string>>({
    founder_name: pr.founder_name ?? '', entity_name: pr.entity_name ?? '', website: pr.website ?? '',
    phone: pr.phone ?? '', contact_email: pr.contact_email ?? '',
    years_experience: pr.years_experience ?? '', bio: pr.bio ?? '', highlights: pr.highlights ?? '',
  });
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const set = (k: string) => (e: any) => { setF((x) => ({ ...x, [k]: e.target.value })); setSaved(false); };
  const save = async () => {
    setBusy(true); setErr('');
    try { await setOrgSettings({ ...(settings ?? {}), profile: Object.fromEntries(Object.entries(f).filter(([, v]) => String(v).trim() !== '')) }); setSaved(true); onSaved(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="About you" sub="Who is buying. This flows into everything: the coach personalises your buy box around it, and your letters and emails weave it in so owners see a credible principal, not a mailshot." />
      <div className="px-8 pb-8 max-w-2xl">
        <div className={card + ' p-5 flex flex-col gap-3'}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Your name</label><input className={input__ + ' w-full'} placeholder="e.g. Sandeep Bansal" value={f.founder_name} onChange={set('founder_name')} /></div>
            <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Buying entity / firm</label><input className={input__ + ' w-full'} placeholder="e.g. Officially Invested Ltd" value={f.entity_name} onChange={set('entity_name')} /></div>
            <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Website</label><input className={input__ + ' w-full'} placeholder="https://…" value={f.website} onChange={set('website')} /></div>
            <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(goes on every letter)</span></label><input className={input__ + ' w-full'} placeholder="07…" value={f.phone} onChange={set('phone')} /></div>
            <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Contact email for letters <span className="text-gray-400 font-normal">(blank = your login email)</span></label><input className={input__ + ' w-full'} placeholder="you@yourfirm.co.uk" value={f.contact_email} onChange={set('contact_email')} /></div>
            <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Years of relevant experience</label><input className={input__ + ' w-full'} placeholder="e.g. 25" value={f.years_experience} onChange={set('years_experience')} /></div>
          </div>
          <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Short bio <span className="text-gray-400 font-normal">(2-4 sentences, as you would say it to an owner over coffee)</span></label>
            <textarea className={input__ + ' w-full min-h-[90px]'} placeholder="e.g. I spent 12 years building and running a commercial cleaning business in Yorkshire before selling it in 2024. Now I buy good local businesses from owners who want to retire, and I keep their people and their name." value={f.bio} onChange={set('bio')} /></div>
          <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Credibility highlights <span className="text-gray-400 font-normal">(one per line: track record, credentials, funding in place)</span></label>
            <textarea className={input__ + ' w-full min-h-[70px]'} placeholder={"Funding agreed with two lenders\nBought and sold 3 businesses\nChartered engineer, 20 years in facilities"} value={f.highlights} onChange={set('highlights')} /></div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy} className={btnGold}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save profile</button>
            {saved && <span className="text-emerald-600 text-[12px] font-semibold">Saved. The coach and your outreach drafts now use this.</span>}
          </div>
        </div>
        <p className="text-[12px] text-gray-400 mt-3">Used in: the Buy Box coach, AI-drafted letters and emails (one or two specifics woven in naturally, never a brag list), and later your funnel page. Never shared with other users of the platform.</p>
      </div>
    </>
  );
}

// ============================ USAGE & BILLING ============================
function BillingView({ settings, onSaved, setErr }: { settings: any; onSaved: () => void; setErr: (s: string) => void }) {
  const u = settings?.outreach ?? {};
  const [vol, setVol] = useState(String(u.letter_monthly_cap ?? 100));
  const [busy, setBusy] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [bal, setBal] = useState<any>(null);
  useEffect(() => { creditsBalance().then(setBal).catch(() => {}); }, []);
  const plan = settings?.plan ?? 'free';
  const managePortal = async () => {
    try { const r = await billingPortal(); if (r.url) window.location.href = r.url; else setErr(r.error ?? 'No subscription found'); }
    catch (e: any) { setErr(e.message || String(e)); }
  };
  const save = async () => {
    setBusy(true); setErr('');
    try { await setOrgSettings({ ...(settings ?? {}), outreach: { ...(settings?.outreach ?? {}), letter_monthly_cap: Number(vol) } }); onSaved(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <div className={card + ' p-5 mb-4 max-w-2xl'}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Current plan</div>
            <div className="font-serif font-bold text-xl text-gray-900 capitalize mt-0.5">{plan === 'free' ? 'Free' : plan}</div>
            <div className="text-[12px] text-gray-500 mt-0.5">{plan === 'free' ? 'Pipeline, CRM and Acquisition Scores are free forever. AI + automation live on paid plans.' : 'Full AI analyst and automation unlocked.'}</div>
          </div>
          <div className="flex gap-2">
            <button className={btnGold} onClick={() => setShowPlans(true)}>{plan === 'free' ? 'Upgrade' : 'Change plan'}</button>
            {plan !== 'free' && <button className={btnGhost} onClick={managePortal}>Manage billing</button>}
          </div>
        </div>
      </div>
      {showPlans && <Paywall context={plan === 'free' ? 'Pick the plan that fits how you buy' : 'Change your plan'} onClose={() => setShowPlans(false)} />}
      <div className={card + ' p-5 mb-4 max-w-2xl'}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Credits this month</div>
          <button className={btnGhost + ' !py-1.5 !px-3 !text-[12px]'} onClick={() => setShowTopup(true)}>Buy credits</button>
        </div>
        {bal ? (
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            {[['AI runs', bal.ai, bal.detail?.ai_monthly ?? 0, bal.detail?.ai_topup ?? 0], ['Letters', bal.letter, bal.detail?.letter_monthly ?? 0, bal.detail?.letter_topup ?? 0]].map(([label, total, monthly, extra]: any) => (
              <div key={label}>
                <div className="flex justify-between text-[13px]"><span className="font-semibold text-gray-800">{label}</span><span className="font-bold text-gray-900">{total}</span></div>
                <div className="h-2 bg-gray-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.min(100, total > 0 ? 100 : 0) + '%', background: total <= 5 ? '#dc2626' : total <= 20 ? '#f59e0b' : '#0A2540' }} /></div>
                <div className="text-[11px] text-gray-400 mt-1">{monthly} monthly (resets 1st) + {extra} purchased{total <= 5 ? ' - running low' : ''}</div>
              </div>
            ))}
          </div>
        ) : <div className="text-[12px] text-gray-400 mt-2">Loading…</div>}
        {bal && (bal.ai <= 5 || bal.letter <= 5) && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-[12px] text-amber-800 flex items-center justify-between">
            <span>You're nearly out of {bal.ai <= 5 ? 'AI' : 'letter'} credits.</span>
            <span><button className="font-bold underline" onClick={() => setShowTopup(true)}>Top up</button> · <button className="font-bold underline" onClick={() => setShowPlans(true)}>Upgrade plan</button></span>
          </div>
        )}
      </div>
      {showTopup && <CreditsTopUp onClose={() => { setShowTopup(false); creditsBalance().then(setBal).catch(() => {}); }} />}
      <Header title="Usage & billing" sub="Control how much the machine does each month. Letters are your only cold-outreach cost - email and phone are free and unlock once a prospect engages." />
      <div className="px-8 pb-8 max-w-xl">
        <div className={card + ' p-5'}>
          <div className="font-semibold text-gray-900 mb-1">Letter volume</div>
          <p className="text-[13px] text-gray-500 mb-3">How many letters may be posted per month, across all campaigns. From £1.20 per letter, printed and posted for you.</p>
          <div className="flex gap-2 items-center">
            <select className={input__} value={vol} onChange={(e) => setVol(e.target.value)}>
              {['25','50','100','250','500','1000'].map((v) => <option key={v} value={v}>{v} letters / month</option>)}
            </select>
            <button onClick={save} disabled={busy} className={btnGold}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Approximate monthly letter spend at this volume: £{(Number(vol) * 1.2).toLocaleString()}.</p>
        </div>
      </div>
    </>
  );
}

// =============================== DEAL FLOW (member releases) ===============================
const DF_LABEL: Record<string, string> = {
  applied: 'Queue', nda_pending: 'NDA pending', nda_signed: 'Awaiting countersign', data_room: 'In data room',
  interest_expressed: 'Interested', intro_call_booked: 'Intro call', offer_submitted: 'Offer', heads_of_terms: 'Heads of terms',
  diligence: 'Diligence', completed: 'Completed', declined: 'Declined', passed: 'Passed', waitlisted: 'Waitlisted', revoked: 'Revoked', expired: 'Expired',
};
const READY_LABEL: Record<string, string> = { cash_ready: 'Cash ready', finance_agreed: 'Finance agreed', finance_not_arranged: 'Finance not arranged', exploring: 'Exploring' };

function DealFlowView({ setErr, initialSubmission }: { setErr: (m: string) => void; initialSubmission?: string | null }) {
  const [releases, setReleases] = useState<any[] | null>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);       // release being managed
  const [board, setBoard] = useState<any | null>(null);
  const [creating, setCreating] = useState<false | string>(false); // false | '' | submission_id to prefill
  const load = () => dfAdminReleases().then((r) => setReleases(r.releases)).catch((e) => setErr(e.message || String(e)));
  useEffect(() => {
    load();
    supabase?.from('submissions').select('id,business_name,reference,status,revenue,net_profit,created_at').order('created_at', { ascending: false }).limit(200).then(({ data }) => setSubs(data ?? []));
    if (initialSubmission) setCreating(initialSubmission);
  }, []);
  const relBySub: Record<string, any> = {};
  (releases ?? []).forEach((r) => { if (r.submission_id) relBySub[r.submission_id] = r; });
  const unreleased = subs.filter((x) => !relBySub[x.id] && !['passed', 'ineligible'].includes(x.status));
  const openBoard = async (r: any) => {
    setOpen(r); setBoard(null);
    try { setBoard(await dfAdminBoard(r.id)); } catch (e: any) { setErr(e.message || String(e)); }
  };
  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-serif text-xl font-bold text-gray-900">Deal flow</h1>
        <button className={btnGold} onClick={() => setCreating('')}><Sparkles className="h-4 w-4" /> Release a deal</button>
      </div>
      <p className="text-[13px] text-gray-500 mb-5">Anonymised member releases. Members apply, sign the NDA in-app, then work the data room. Everything they touch is logged.</p>
      {!releases ? <div className="text-gray-400 py-16 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
        <div className="space-y-3">
          {releases.map((r) => (
            <div key={r.id} className={card + ' p-4 cursor-pointer hover:border-[#0A2540]/40'} onClick={() => openBoard(r)}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (r.status === 'released' ? 'bg-emerald-100 text-emerald-700' : r.status === 'draft' ? 'bg-gray-100 text-gray-500' : r.status === 'under_offer' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>{r.status.replace('_', ' ').toUpperCase()}</span>
                <span className="font-semibold text-gray-900 text-[14px]">{r.headline}</span>
                {r.ownership_score != null && <span className="text-[11px] text-gray-500">Score {r.ownership_score}</span>}
              </div>
              <div className="flex gap-4 text-[12px] text-gray-500 mt-2">
                <span><b className="text-gray-900">{r.n_applied}</b> applied</span>
                <span><b className="text-gray-900">{r.n_nda}</b> NDA'd</span>
                <span><b className="text-gray-900">{r.n_interested}</b> interested</span>
                {r.n_queue > 0 && <span className="text-amber-700 font-semibold">{r.n_queue} in queue</span>}
                {r.hottest_readiness && <span>Hottest: {['', 'Cash ready', 'Finance agreed', 'Finance not arranged', 'Exploring'][r.hottest_readiness]}</span>}
                {r.status === 'draft' && (
                  <button className="ml-auto text-[#0A2540] font-bold hover:underline" onClick={async (e) => { e.stopPropagation(); try { const x = await dfAdminPublish(r.id); setErr(''); load(); alert(`Released. ${x.notified} member(s) notified.`); } catch (er: any) { setErr(er.message || String(er)); } }}>Publish →</button>
                )}
              </div>
            </div>
          ))}
          {!releases.length && <div className={card + ' p-10 text-center text-gray-400 text-sm'}>No releases yet. Release a pipeline deal to your members - anonymised until NDA.</div>}
        </div>
      )}
      {/* every pipeline deal, released or not */}
      <div className="mt-8">
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Your pipeline · {unreleased.length} not yet released</div>
        <div className={card + ' overflow-hidden'}>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-4 py-2.5">Deal</th><th className="px-4 py-2.5">Pipeline stage</th><th className="px-4 py-2.5">Members</th><th className="px-4 py-2.5 text-right">Action</th>
            </tr></thead>
            <tbody>
              {subs.map((x) => {
                const rel = relBySub[x.id];
                return (
                  <tr key={x.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5"><div className="font-semibold text-gray-900">{x.business_name || '-'}</div><div className="text-[11px] text-gray-400">{x.reference}</div></td>
                    <td className="px-4 py-2.5 text-gray-600 capitalize">{String(x.status).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5">
                      {rel ? (
                        <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (rel.status === 'released' ? 'bg-emerald-100 text-emerald-700' : rel.status === 'draft' ? 'bg-gray-100 text-gray-500' : rel.status === 'under_offer' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                          {rel.status === 'released' ? `LIVE · ${rel.n_applied} applied · ${rel.n_nda} NDA'd` : rel.status.replace('_', ' ').toUpperCase()}
                        </span>
                      ) : <span className="text-[11px] text-gray-400">Not released</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {rel
                        ? <button className="text-[12px] font-bold text-[#0A2540] hover:underline" onClick={() => openBoard(rel)}>Manage →</button>
                        : <button className="text-[12px] font-bold text-[#0A2540] hover:underline" onClick={() => setCreating(x.id)}>Release →</button>}
                    </td>
                  </tr>
                );
              })}
              {!subs.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No pipeline deals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {creating !== false && <ReleaseForm initialSubmissionId={creating || undefined} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} setErr={setErr} />}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setOpen(null)}>
          <div className="w-full max-w-2xl bg-white h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-serif font-bold text-lg text-gray-900">{open.headline}</div>
                <div className="text-[12px] text-gray-500">{open.status} · NDA cap {open.nda_max}</div>
              </div>
              <button onClick={() => setOpen(null)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            {!board ? <div className="py-16 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <div className="mt-5 space-y-6">
                {/* queue */}
                {board.opportunities.filter((o: any) => o.state === 'applied').length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-2">Application queue · 24h SLA</div>
                    {board.opportunities.filter((o: any) => o.state === 'applied').map((o: any) => (
                      <div key={o.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3.5 mb-2">
                        <div className="flex items-center gap-2 text-[13px]"><b>{o.full_name}</b><span className="text-gray-500 capitalize">({o.tier})</span><span className="text-gray-500">· {READY_LABEL[o.funding_readiness] ?? o.funding_readiness}</span></div>
                        {o.application?.motivation && <div className="text-[12px] text-gray-600 mt-1 italic">"{o.application.motivation}"</div>}
                        <div className="flex gap-2 mt-2.5">
                          <button className={btnPrimary + ' !py-1.5 !px-3 !text-[12px]'} onClick={async () => { await dfAdminDecide(o.id, 'approve').catch((e: any) => setErr(e.message)); openBoard(open); }}>Approve</button>
                          {['deal oversubscribed', 'outside stated funding readiness', 'buy-box mismatch'].map((reason) => (
                            <button key={reason} className={btnGhost + ' !py-1.5 !px-3 !text-[12px]'} onClick={async () => { await dfAdminDecide(o.id, 'decline', reason).catch((e: any) => setErr(e.message)); openBoard(open); }}>Decline: {reason.split(' ')[0]}…</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* live opportunities */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Member opportunities</div>
                  {board.opportunities.filter((o: any) => o.state !== 'applied').map((o: any) => (
                    <div key={o.id} className="border border-gray-200 rounded-xl p-3.5 mb-2">
                      <div className="flex items-center gap-2 flex-wrap text-[13px]">
                        <b>{o.full_name}</b><span className="text-gray-500 capitalize">({o.tier})</span>
                        <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (['interest_expressed','intro_call_booked','offer_submitted','heads_of_terms','diligence'].includes(o.state) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>{DF_LABEL[o.state] ?? o.state}</span>
                        {o.exclusivity && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFD700] text-[#0A2540]">EXCLUSIVE</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">{READY_LABEL[o.funding_readiness] ?? o.funding_readiness} · {o.doc_activity} data-room opens · {o.questions} questions{o.nda_signed_at ? ` · NDA ${String(o.nda_signed_at).slice(0, 10)}` : ''}</div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {o.state === 'nda_signed' && <button className={btnPrimary + ' !py-1 !px-2.5 !text-[11px]'} onClick={async () => { await dfAdminCountersign(o.id).catch((e: any) => setErr(e.message)); openBoard(open); }}>Countersign NDA</button>}
                        {['interest_expressed', 'intro_call_booked', 'offer_submitted', 'heads_of_terms'].includes(o.state) && (
                          <>
                            <select className={input__ + ' !py-1 !text-[11px]'} defaultValue="" onChange={async (e) => { if (!e.target.value) return; await dfAdminAdvance(o.id, e.target.value).catch((er: any) => setErr(er.message)); openBoard(open); }}>
                              <option value="">Advance to…</option>
                              {['intro_call_booked', 'offer_submitted', 'heads_of_terms', 'diligence', 'completed'].map((x) => <option key={x} value={x}>{DF_LABEL[x]}</option>)}
                            </select>
                            {!o.exclusivity && <button className={btnGold + ' !py-1 !px-2.5 !text-[11px]'} onClick={async () => { if (!confirm('Grant exclusivity? All other live members are waitlisted with the honest email.')) return; await dfAdminExclusivity(o.id).catch((e: any) => setErr(e.message)); openBoard(open); }}>Grant exclusivity</button>}
                          </>
                        )}
                        {!['completed', 'declined', 'revoked', 'passed', 'expired'].includes(o.state) && <button className={btnGhost + ' !py-1 !px-2.5 !text-[11px] !text-red-600 !border-red-200'} onClick={async () => { const rs = prompt('Revoke reason'); if (rs === null) return; await dfAdminAdvance(o.id, 'revoked', rs).catch((e: any) => setErr(e.message)); openBoard(open); }}>Revoke</button>}
                      </div>
                    </div>
                  ))}
                  {!board.opportunities.length && <div className="text-[12px] text-gray-400">No member activity yet.</div>}
                </div>
                {/* Q&A */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Q&A</div>
                  {board.qa.map((q: any) => <QARow key={q.id} q={q} onAnswered={() => openBoard(open)} setErr={setErr} />)}
                  {!board.qa.length && <div className="text-[12px] text-gray-400">No questions yet.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QARow({ q, onAnswered, setErr }: { q: any; onAnswered: () => void; setErr: (m: string) => void }) {
  const [a, setA] = useState(q.answer ?? '');
  const [pub, setPub] = useState(q.published ?? true);
  const [busy, setBusy] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl p-3 mb-2">
      <div className="text-[13px] text-gray-800"><b>{q.full_name ?? 'Member'}:</b> {q.question}</div>
      <div className="flex gap-2 mt-2">
        <input className={input__ + ' flex-1 !text-[12px]'} placeholder="Answer" value={a} onChange={(e) => setA(e.target.value)} />
        <label className="flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> publish to all</label>
        <button className={btnPrimary + ' !py-1.5 !px-3 !text-[12px]'} disabled={busy || !a.trim()} onClick={async () => { setBusy(true); try { await dfAdminAnswer(q.id, a, pub); onAnswered(); } catch (e: any) { setErr(e.message || String(e)); } setBusy(false); }}>{q.answer ? 'Update' : 'Answer'}</button>
      </div>
    </div>
  );
}

const TURNOVER_BANDS = ['£750k–1m', '£1–2m', '£2–5m', '£5–10m', '£10m+'];
const EBITDA_BANDS = ['£180–300k', '£300–500k', '£500k–1m', '£1m+'];
const UK_REGIONS = ['North West', 'North East', 'Yorkshire', 'Midlands', 'East of England', 'London', 'South East', 'South West', 'Wales', 'Scotland', 'Northern Ireland'];

function ReleaseForm({ onClose, onSaved, setErr, initialSubmissionId }: { onClose: () => void; onSaved: () => void; setErr: (m: string) => void; initialSubmissionId?: string }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [f, setF] = useState<any>({ headline: '', sector_group: '', region: 'North West', turnover_band: TURNOVER_BANDS[1], ebitda_band: EBITDA_BANDS[1], guide_multiple: '', why_sourced: '', nda_max: 10, manual_review: false, countersign_mode: 'auto', submission_id: initialSubmissionId ?? '', windows_academy: 7 });
  const [si, setSi] = useState<any>({ oldest_director_age: '', revenue: '', ebitda: '', incorporated_on: '', accounts_current: true, seller_engaged: true, asset_backing: 'none' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('submissions').select('id,business_name,reference,status').order('created_at', { ascending: false }).limit(80).then(({ data }) => setSubs(data ?? []));
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await dfAdminReleaseUpsert(
        { submission_id: f.submission_id || null, headline: f.headline, sector_group: f.sector_group || null, region: f.region, turnover_band: f.turnover_band, ebitda_band: f.ebitda_band, guide_multiple: f.guide_multiple || null, why_sourced: f.why_sourced, nda_max: Number(f.nda_max) || 10, manual_review: f.manual_review, countersign_mode: f.countersign_mode, tier_windows: { circle: 0, accelerator: 3, academy: Number(f.windows_academy) || 7 } },
        { oldest_director_age: Number(si.oldest_director_age) || 0, revenue: Number(si.revenue) || 0, ebitda: Number(si.ebitda) || 0, incorporated_on: si.incorporated_on || null, accounts_current: si.accounts_current, seller_engaged: si.seller_engaged, asset_backing: si.asset_backing },
      );
      onSaved();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-serif font-bold text-lg text-gray-900">Release a deal to members</div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3.5">
          <div>
            <div className="text-[12px] font-semibold text-gray-700 mb-1">Pipeline deal (identity revealed only after NDA)</div>
            <select className={input__ + ' w-full'} value={f.submission_id} onChange={(e) => set('submission_id', e.target.value)}>
              <option value="">- none / off-pipeline -</option>
              {subs.map((x) => <option key={x.id} value={x.id}>{x.reference} · {x.business_name}</option>)}
            </select>
          </div>
          <input className={input__ + ' w-full'} placeholder="Anonymised headline, e.g. Established plumbing contractor, North West" value={f.headline} onChange={(e) => set('headline', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className={input__} placeholder="Sector group (e.g. Trades & services)" value={f.sector_group} onChange={(e) => set('sector_group', e.target.value)} />
            <select className={input__} value={f.region} onChange={(e) => set('region', e.target.value)}>{UK_REGIONS.map((x) => <option key={x}>{x}</option>)}</select>
            <select className={input__} value={f.turnover_band} onChange={(e) => set('turnover_band', e.target.value)}>{TURNOVER_BANDS.map((x) => <option key={x}>{x}</option>)}</select>
            <select className={input__} value={f.ebitda_band} onChange={(e) => set('ebitda_band', e.target.value)}>{EBITDA_BANDS.map((x) => <option key={x}>{x}</option>)}</select>
          </div>
          <input className={input__ + ' w-full'} placeholder="Guide multiple, e.g. 4.2× adj. EBITDA" value={f.guide_multiple} onChange={(e) => set('guide_multiple', e.target.value)} />
          <div>
            <div className="text-[12px] font-semibold text-gray-700 mb-1">"Why I sourced this" - 3–4 sentences, in your voice. The highest-converting element on the page.</div>
            <textarea className={input__ + ' w-full'} rows={4} value={f.why_sourced} onChange={(e) => set('why_sourced', e.target.value)} />
          </div>
          <div className="bg-gray-50 rounded-xl p-3.5">
            <div className="text-[12px] font-bold text-gray-900 mb-2">Ownership Score inputs (auto-scored, explainable)</div>
            <div className="grid grid-cols-2 gap-2.5">
              <input className={input__} placeholder="Oldest director age" value={si.oldest_director_age} onChange={(e) => setSi({ ...si, oldest_director_age: e.target.value })} />
              <input className={input__} placeholder="Incorporated (YYYY-MM-DD)" value={si.incorporated_on} onChange={(e) => setSi({ ...si, incorporated_on: e.target.value })} />
              <input className={input__} placeholder="Revenue £" value={si.revenue} onChange={(e) => setSi({ ...si, revenue: e.target.value })} />
              <input className={input__} placeholder="Adj EBITDA £" value={si.ebitda} onChange={(e) => setSi({ ...si, ebitda: e.target.value })} />
              <select className={input__} value={si.asset_backing} onChange={(e) => setSi({ ...si, asset_backing: e.target.value })}>
                <option value="none">No asset backing</option><option value="partial">Partial (some property/plant)</option><option value="full">Freehold / asset-rich</option>
              </select>
              <div className="flex flex-col gap-1 text-[12px] text-gray-600">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.accounts_current} onChange={(e) => setSi({ ...si, accounts_current: e.target.checked })} /> Accounts current</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.seller_engaged} onChange={(e) => setSi({ ...si, seller_engaged: e.target.checked })} /> Seller engaged</label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><div className="text-[11px] text-gray-500 mb-1">NDA cap</div><input className={input__ + ' w-full'} value={f.nda_max} onChange={(e) => set('nda_max', e.target.value)} /></div>
            <div><div className="text-[11px] text-gray-500 mb-1">Academy opens after (days)</div><input className={input__ + ' w-full'} value={f.windows_academy} onChange={(e) => set('windows_academy', e.target.value)} /></div>
            <div><div className="text-[11px] text-gray-500 mb-1">Countersign</div>
              <select className={input__ + ' w-full'} value={f.countersign_mode} onChange={(e) => set('countersign_mode', e.target.value)}><option value="auto">Automatic</option><option value="admin">I countersign</option></select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={f.manual_review} onChange={(e) => set('manual_review', e.target.checked)} /> Manual review for Accelerator too (Academy is always reviewed)</label>
          <button className={btnGold + ' w-full'} disabled={busy || !f.headline.trim() || !f.why_sourced.trim()} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save as draft'}</button>
          <div className="text-[11px] text-gray-400 text-center">Saved as draft - publish from the Deal flow list when you're ready. Publishing emails eligible members.</div>
        </div>
      </div>
    </div>
  );
}

// =============================== MEMBERS ===============================
function MembersView({ setErr }: { setErr: (m: string) => void }) {
  const [members, setMembers] = useState<any[] | null>(null);
  const [nm, setNm] = useState({ email: '', full_name: '', tier: 'academy' });
  const [busy, setBusy] = useState(false);
  const load = () => dfAdminMembers().then((r) => setMembers(r.members)).catch((e) => setErr(e.message || String(e)));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setBusy(true);
    try { await dfAdminMemberUpsert(nm); setNm({ email: '', full_name: '', tier: 'academy' }); load(); } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="font-serif text-xl font-bold text-gray-900 mb-1">Members</h1>
      <p className="text-[13px] text-gray-500 mb-5">Deal-flow membership and tiers. Circle sees deals instantly with unlimited NDA slots; Accelerator has 3 slots; Academy has 1 and applications are reviewed.</p>
      <div className={card + ' p-4 mb-4'}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input className={input__} placeholder="Email" value={nm.email} onChange={(e) => setNm({ ...nm, email: e.target.value })} />
          <input className={input__} placeholder="Full name" value={nm.full_name} onChange={(e) => setNm({ ...nm, full_name: e.target.value })} />
          <select className={input__} value={nm.tier} onChange={(e) => setNm({ ...nm, tier: e.target.value })}>
            <option value="circle">Circle</option><option value="accelerator">Accelerator</option><option value="academy">Academy</option>
          </select>
          <button className={btnPrimary} disabled={busy || !nm.email.includes('@')} onClick={add}>Add member</button>
        </div>
        <div className="text-[11px] text-gray-400 mt-2">They sign in (or sign up) at /deals with this email and are linked automatically.</div>
      </div>
      {!members ? <div className="text-gray-400 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
        <div className={card + ' overflow-hidden'}>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-4 py-2.5">Member</th><th className="px-4 py-2.5">Tier</th><th className="px-4 py-2.5">Slots</th><th className="px-4 py-2.5">Deals</th><th className="px-4 py-2.5">Status</th>
            </tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5"><div className="font-semibold text-gray-900">{m.full_name || '-'}</div><div className="text-[11px] text-gray-500">{m.email}</div></td>
                  <td className="px-4 py-2.5">
                    <select className={input__ + ' !py-1 !text-[12px]'} value={m.tier} onChange={async (e) => { await dfAdminMemberUpsert({ id: m.id, full_name: m.full_name, tier: e.target.value, status: m.status }).catch((er: any) => setErr(er.message)); load(); }}>
                      <option value="circle">Circle</option><option value="accelerator">Accelerator</option><option value="academy">Academy</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{m.slots_used}{m.tier === 'circle' ? '' : `/${m.tier === 'accelerator' ? 3 : 1}`}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.deal_count}</td>
                  <td className="px-4 py-2.5">
                    <button className={'text-[11px] font-bold px-2 py-0.5 rounded-full ' + (m.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}
                      onClick={async () => { await dfAdminMemberUpsert({ id: m.id, full_name: m.full_name, tier: m.tier, status: m.status === 'active' ? 'suspended' : 'active' }).catch((er: any) => setErr(er.message)); load(); }}>
                      {m.status}
                    </button>
                  </td>
                </tr>
              ))}
              {!members.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No members yet - add your first above.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
