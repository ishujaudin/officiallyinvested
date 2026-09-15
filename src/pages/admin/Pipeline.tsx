import { dfAdminReleases } from '../../lib/acq';
import PipelineLite from './PipelineLite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Loader2, LogOut, Mail, X, RefreshCw, Star, AlertTriangle, LayoutGrid, Table as TableIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { STAGES, CHECKLISTS, ITEM_KINDS, TERMINAL_STAGES, PARALLEL_STAGES, STAGE_ASSISTS, gbp } from '../../lib/stages';
import { useKanbanDrag, columnClass } from '../../components/kanban/useKanbanDrag';
import StageMoveSelect from '../../components/kanban/StageMoveSelect';
import DealAnalysisPanel from '../../components/DealAnalysisPanel';
import { getVerdicts } from '../../lib/acq';
import AddDealModal from '../../components/AddDealModal';
import ThesisSettingsModal from '../../components/ThesisSettingsModal';
import CRMModal from '../../components/CRMModal';
import AlertsModal from '../../components/AlertsModal';

const ADMIN_DOMAIN = '@officiallyinvested.com';
const STALE_DAYS = 5;

interface Deal {
  id: string;
  reference: string;
  created_at: string;
  type: 'business' | 'property';
  status: string;
  member_listed: boolean;
  network_optin: boolean;
  secondary_stages: string[];
  [key: string]: any;
  deal_items: any[];
  documents: any[];
  communications: any[];
  scores: any[];
  deal_outputs: any[];
}

function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 864e5); }
function assetName(r: Deal) { return r.business_name || r.spv_name || '-'; }
function valueLabel(r: Deal) { return r.type === 'business' ? 'Value' : r.deal_kind === 'development' ? 'GDV' : 'Portfolio value'; }
function latestScore(r: Deal) {
  return [...(r.scores || [])].sort((a, b) => +new Date(b.scored_at) - +new Date(a.scored_at))[0] || null;
}
function items(r: Deal) { return (r.deal_items || []).filter((i) => i.kind !== 'checklist'); }
function checklist(r: Deal) { return (r.deal_items || []).filter((i) => i.kind === 'checklist'); }

function ballState(r: Deal): { cls: string; label: string } | null {
  if (TERMINAL_STAGES.includes(r.status)) return null;
  const vend = items(r).filter((i) => i.kind === 'vendor_outstanding' && !i.is_done);
  if (vend.length) {
    const oldest = Math.max(...vend.map((i) => daysAgo(i.created_at)));
    return { cls: 'vendor', label: `Waiting on vendor - ${oldest}d${oldest >= STALE_DAYS ? ' · chase now' : ''}` };
  }
  const steps = items(r)
    .filter((i) => ['next_step', 'clarification', 'funding'].includes(i.kind) && !i.is_done)
    .concat(checklist(r).filter((i) => i.stage === r.status && !i.is_done));
  if (steps.length) {
    const oldest = Math.max(...steps.map((i) => daysAgo(i.created_at)));
    return oldest >= STALE_DAYS
      ? { cls: 'you-stale', label: `YOUR MOVE - stalled ${oldest}d` }
      : { cls: 'you', label: `Your move - ${steps.length} open` };
  }
  return { cls: 'none', label: 'No next action - set one' };
}

const BALL_STYLES: Record<string, string> = {
  you: 'bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/40',
  'you-stale': 'bg-red-500/20 text-red-300 border border-red-400/60',
  vendor: 'bg-amber-500/15 text-amber-300 border border-amber-400/50',
  none: 'bg-red-500/10 text-red-300 border border-dashed border-red-400/50',
};

const VERDICT_PILL: Record<string, string> = {
  BUY: 'bg-emerald-500/25 text-emerald-200',
  WATCH: 'bg-amber-500/25 text-amber-100',
  PASS: 'bg-white/15 text-white/60',
};

function TierBadge({ r }: { r: Deal }) {
  const sc = latestScore(r);
  if (!sc?.tier) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">unscored</span>;
  const cls = sc.tier === 'A' ? 'bg-emerald-600 text-white' : sc.tier === 'B' ? 'bg-[#FFD700] text-[#0A2540]' : sc.tier === 'C' ? 'bg-amber-500 text-amber-950' : 'bg-white/20 text-white';
  return <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + cls}>{sc.tier} · {sc.fit_score}</span>;
}

// ================= LOGIN =================

function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const magicLink = async () => {
    if (!supabase || !email) return;
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + '/admin/pipeline' },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  const google = async () => {
    if (!supabase) return;
    setErr('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/admin/pipeline' },
    });
    if (error) setErr(error.message);
  };

  return (
    <div className="min-h-screen bg-[#0A2540] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-[#FFD700] rotate-45" style={{ clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }}></div>
          <div>
            <h1 className="text-xl font-serif font-bold text-[#FFD700]">Officially Invested</h1>
            <p className="text-white/50 text-xs">Deal pipeline - team access only</p>
          </div>
        </div>
        {sent ? (
          <div className="text-white/80">
            <Mail className="h-8 w-8 text-[#FFD700] mb-3" />
            Check your inbox - we've sent a magic link to <span className="text-white font-semibold">{email}</span>.
          </div>
        ) : (
          <>
            <label className="block text-white/80 text-sm mb-2">Work email ({ADMIN_DOMAIN})</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && magicLink()}
              placeholder={'you' + ADMIN_DOMAIN}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#FFD700] mb-3"
            />
            <button
              onClick={magicLink}
              disabled={busy}
              className="w-full bg-[#FFD700] text-[#0A2540] py-3 rounded-full font-semibold hover:bg-opacity-90 transition-all disabled:opacity-60 mb-3"
            >
              {busy ? 'Sending…' : 'Email me a magic link'}
            </button>
            <button
              onClick={google}
              className="w-full bg-white text-[#0A2540] py-3 rounded-full font-semibold hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
              Continue with Google
            </button>
            {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
            <p className="text-white/40 text-xs mt-4">Only {ADMIN_DOMAIN} accounts can access deal data.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ================= DASHBOARD =================

export default function Pipeline() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [verdictMap, setVerdictMap] = useState<Record<string, { verdict?: string; score?: number }>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showThesis, setShowThesis] = useState(false);
  const [showCRM, setShowCRM] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [relMap, setRelMap] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!session) return;
    dfAdminReleases().then((r) => {
      const m: Record<string, any> = {};
      (r.releases ?? []).forEach((x: any) => { if (x.submission_id) m[x.submission_id] = x; });
      setRelMap(m);
    }).catch(() => {});
    getVerdicts().then((r) => {
      const m: Record<string, { verdict?: string; score?: number }> = {};
      (r.verdicts ?? []).forEach((v) => { m[v.submission_id] = { verdict: v.verdict, score: v.score }; });
      setVerdictMap(m);
    }).catch(() => {});
  }, [session, deals.length]);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const authorised = !!session?.user?.email?.toLowerCase().endsWith(ADMIN_DOMAIN);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoadErr('');
    const { data, error } = await supabase
      .from('submissions')
      .select('*, deal_items(*), documents(*), communications(*), scores(*), deal_outputs(*)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) setLoadErr(error.message);
    else setDeals((data as Deal[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (authorised) load(); }, [authorised, load]);

  const ensureChecklist = async (deal: Deal, stage: string) => {
    if (!supabase) return;
    const tpl = CHECKLISTS[stage];
    if (!tpl?.length) return;
    if (checklist(deal).some((i) => i.stage === stage)) return;
    await supabase.from('deal_items').insert(
      tpl.map((c) => ({ submission_id: deal.id, kind: 'checklist', content: c, stage })),
    );
  };

  const moveDeal = async (id: string, stage: string) => {
    if (!supabase) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.status === stage) return;
    const prev = deal.status;
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, status: stage } : d)));
    const { error } = await supabase.from('submissions').update({ status: stage }).eq('id', id);
    if (error) {
      setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, status: prev } : d)));
      alert('Could not save: ' + error.message);
      return;
    }
    await ensureChecklist(deal, stage);
    load();
  };
  const dnd = useKanbanDrag(moveDeal);

  const open = openId ? deals.find((d) => d.id === openId) ?? null : null;
  useEffect(() => {
    if (open) {
      ensureChecklist(open, open.status).then(() => {});
      (open.secondary_stages ?? []).forEach((s) => ensureChecklist(open, s).then(() => {}));
    }
    /* eslint-disable-next-line */
  }, [openId]);

  const toggleParallel = async (deal: Deal, stage: string) => {
    if (!supabase) return;
    const current = deal.secondary_stages ?? [];
    const next = current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage];
    const { error } = await supabase.from('submissions').update({ secondary_stages: next }).eq('id', deal.id);
    if (error) { alert(error.message); return; }
    if (!current.includes(stage)) await ensureChecklist(deal, stage);
    load();
  };

  const [assistBusy, setAssistBusy] = useState('');
  const runAssist = async (deal: Deal, key: string, instructions?: string, refineOf?: string) => {
    if (!supabase) return;
    setAssistBusy(key + (refineOf ?? ''));
    setMsg(instructions ? 'Revising with your adjustments…' : '');
    try {
      const { data, error } = await supabase.functions.invoke('stage-assist', {
        body: { submission_id: deal.id, assist_key: key, instructions, refine_of: refineOf },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMsg('Done - output saved below.');
      load();
    } catch (e: any) {
      setMsg('Assist failed: ' + (e?.message ?? String(e)));
    }
    setAssistBusy('');
  };

  const saveOutput = async (output: any, content: string) => {
    if (!supabase) return;
    await supabase.from('deal_outputs').update({ content, edited_at: new Date().toISOString() }).eq('id', output.id);
    load();
  };
  const selectOutput = async (deal: Deal, output: any) => {
    if (!supabase) return;
    if (!output.selected) {
      await supabase.from('deal_outputs').update({ selected: false }).eq('submission_id', deal.id).eq('assist_key', output.assist_key);
      await supabase.from('deal_outputs').update({ selected: true }).eq('id', output.id);
    } else {
      await supabase.from('deal_outputs').update({ selected: false }).eq('id', output.id);
    }
    load();
  };
  const deleteOutput = async (output: any) => {
    if (!supabase || !confirm('Delete this output?')) return;
    await supabase.from('deal_outputs').delete().eq('id', output.id);
    load();
  };

  const filteredDeals = useMemo(() => {
    if (filter === 'all') return deals;
    if (filter === 'members') return deals.filter((d) => d.member_listed);
    return deals.filter((d) => d.type === filter);
  }, [deals, filter]);

  // ---------- item / doc / comm actions ----------
  const addItem = async (dealId: string, kind: string, content: string) => {
    if (!supabase || !content.trim()) return;
    await supabase.from('deal_items').insert({ submission_id: dealId, kind, content: content.trim() });
    load();
  };
  const toggleItem = async (item: any) => {
    if (!supabase) return;
    await supabase.from('deal_items').update({ is_done: !item.is_done, done_at: item.is_done ? null : new Date().toISOString() }).eq('id', item.id);
    load();
  };
  const deleteItem = async (id: string) => {
    if (!supabase) return;
    await supabase.from('deal_items').delete().eq('id', id);
    load();
  };
  const saveItemNote = async (id: string, note: string) => {
    if (!supabase) return;
    await supabase.from('deal_items').update({ note: note.trim() || null }).eq('id', id);
    load();
  };

  /** Turn a plan-type AI output into tickable checklist items on the deal. */
  const PLAN_STAGE: Record<string, string> = {
    'commercial-dd-plan': 'dd_commercial', 'accountant-pack': 'dd_financial', 'solicitor-pack': 'dd_legal',
    'completion-checklist': 'pre_completion', 'takeover-plan': 'takeover', 'hundred-day-plan': 'completed',
    'discovery-pack': 'discovery_call', 'screen-brief': 'reviewing',
  };
  const trackAsChecklist = async (deal: Deal, output: any) => {
    if (!supabase) return;
    const stage = PLAN_STAGE[output.assist_key] ?? deal.status;
    const lines = output.content.split('\n');
    const tasks: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      const m = line.match(/^(?:[-*]\s*(?:\[[ x]\])?|\d+\.)\s+(.{8,200})$/);
      if (!m) continue;
      let t = m[1].replace(/\*\*/g, '').replace(/\[([BAS])\]/g, '($1)').trim();
      if (/^(option|note:|tip:|e\.g\.|i\.e\.)/i.test(t)) continue;
      tasks.push(t);
      if (tasks.length >= 30) break;
    }
    if (!tasks.length) { setMsg('No actionable lines found in this output.'); return; }
    const existing = new Set((deal.deal_items || []).map((i: any) => i.content));
    const rows = tasks.filter((t) => !existing.has(t)).map((t) => ({ submission_id: deal.id, kind: 'checklist', content: t, stage }));
    if (!rows.length) { setMsg('All items from this plan are already on the deal.'); return; }
    const { error } = await supabase.from('deal_items').insert(rows);
    setMsg(error ? 'Could not add: ' + error.message : `Added ${rows.length} tickable items to the deal - progress and your notes feed the next assessment.`);
    load();
  };
  const rescore = async (dealId: string) => {
    if (!supabase) return;
    setMsg('Re-scoring with the OI framework…');
    const { error } = await supabase.rpc('trigger_rescore', { p_submission_id: dealId });
    if (error) { setMsg('Could not trigger: ' + error.message); return; }
    setTimeout(() => { load(); setMsg('Re-scored - fresh assessment saved.'); }, 18000);
  };

  // ---------- render ----------
  if (!supabase) return <Shell><p className="text-white/70 p-10">Supabase isn't configured (missing env vars).</p></Shell>;
  if (!authReady) return <Shell><div className="p-16 text-center"><Loader2 className="h-7 w-7 animate-spin text-[#FFD700] mx-auto" /></div></Shell>;
  if (!session) return <Login />;
  if (!authorised) return <PipelineLite />;
  if (false) {
    return (
      <Shell>
        <div className="max-w-md mx-auto mt-20 bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
          <p className="text-white mb-2">Signed in as <b>{session?.user.email}</b></p>
          <p className="text-white/60 mb-6">Only {ADMIN_DOMAIN} accounts can access the pipeline.</p>
          <button onClick={() => supabase!.auth.signOut()} className="bg-white/10 text-white px-6 py-2.5 rounded-full font-semibold hover:bg-white/20">Sign out & switch account</button>
        </div>
      </Shell>
    );
  }

  const weekAgo = Date.now() - 7 * 864e5;
  const live = deals.filter((d) => !TERMINAL_STAGES.includes(d.status));
  const kpis: [string, string | number][] = [
    ['New this week', deals.filter((d) => +new Date(d.created_at) > weekAgo).length],
    ['Live deals', live.length],
    ['Opportunity value', gbp(live.reduce((a, d) => a + (Number(d.type === 'business' ? d.asking_price : (d.portfolio_value ?? d.asking_price)) || 0), 0))],
    ['You’re holding up', deals.filter((d) => { const b = ballState(d); return b && (b.cls === 'you-stale' || b.cls === 'none'); }).length],
    ['Waiting on vendor', deals.reduce((a, d) => a + items(d).filter((i) => i.kind === 'vendor_outstanding' && !i.is_done).length, 0)],
    ['Open red flags', deals.reduce((a, d) => a + items(d).filter((i) => i.kind === 'red_flag' && !i.is_done).length, 0)],
  ];

  return (
    <Shell>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FFD700] rotate-45" style={{ clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }}></div>
          <div>
            <h1 className="text-xl font-serif font-bold text-[#FFD700]">Deal Pipeline</h1>
            <p className="text-white/40 text-xs">{session.user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/origination" className="bg-white/10 text-[#FFD700] border border-[#FFD700]/40 px-3 py-1.5 rounded-full text-sm font-semibold mr-1 hover:bg-white/15">Origination</a>
          <button onClick={() => setShowAlerts(true)} className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Alerts</button>
          <a href="/admin/crm" className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">CRM</a>
          <button onClick={() => setShowThesis(true)} className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Thesis</button>
          <a href="/admin/settings" className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Settings</a>
          <button onClick={() => setShowAdd(true)} className="bg-[#FFD700] text-[#0A2540] px-3.5 py-1.5 rounded-full text-sm font-semibold hover:bg-opacity-90 mr-1">+ Add deal</button>
          <button onClick={load} className="text-white/60 hover:text-white p-2" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => supabase!.auth.signOut()} className="text-white/60 hover:text-white p-2" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 mb-5">
          {kpis.map(([label, value]) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
              <div className="text-white/50 text-[11px] mb-0.5">{label}</div>
              <div className="text-[#FFD700] text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <div className="flex border border-white/20 rounded-full overflow-hidden">
            <button onClick={() => setView('kanban')} className={'px-4 py-1.5 text-sm font-semibold flex items-center gap-1.5 ' + (view === 'kanban' ? 'bg-[#FFD700] text-[#0A2540]' : 'text-white/70')}><LayoutGrid className="h-3.5 w-3.5" />Kanban</button>
            <button onClick={() => setView('table')} className={'px-4 py-1.5 text-sm font-semibold flex items-center gap-1.5 ' + (view === 'table' ? 'bg-[#FFD700] text-[#0A2540]' : 'text-white/70')}><TableIcon className="h-3.5 w-3.5" />Table</button>
          </div>
          {[['all', 'All'], ['business', 'Businesses'], ['property', 'Property'], ['members', '★ Member deals']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={'px-4 py-1.5 rounded-full text-sm font-semibold border ' + (filter === k ? 'bg-white text-[#0A2540] border-white' : 'bg-white/5 text-white/70 border-white/15')}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div className="p-16 text-center"><Loader2 className="h-7 w-7 animate-spin text-[#FFD700] mx-auto" /></div>
        ) : loadErr ? (
          <p className="text-red-300 p-8">{loadErr}</p>
        ) : view === 'kanban' ? (
          <div className="overflow-x-auto pb-3" {...dnd.containerProps}>
            {/* items-stretch + min height: every column is a full-height drop target, not just its cards */}
            <div className="flex gap-2.5 items-stretch min-w-max min-h-[60vh]">
              {STAGES.map((s) => {
                const inStage = filteredDeals.filter((d) => d.status === s.key);
                return (
                  <div
                    key={s.key}
                    className={columnClass('bg-white/[0.04] border border-white/10 rounded-xl p-2.5 w-[210px] shrink-0 flex flex-col transition-colors', s.key, dnd.overStage, !!dnd.draggingId)}
                    {...dnd.columnProps(s.key)}
                  >
                    <div className="text-[#FFD700]/70 text-[9px] font-bold uppercase tracking-wider mb-1 px-1">{s.group}</div>
                    <div className="flex justify-between text-white/70 text-[11px] font-bold uppercase tracking-wide px-1 pb-2">
                      {s.label} <span className="text-[#FFD700]">{inStage.length}</span>
                    </div>
                    {inStage.map((d) => {
                      const b = ballState(d);
                      const flags = items(d).filter((i) => i.kind === 'red_flag' && !i.is_done).length;
                      const cl = checklist(d);
                      return (
                        <div
                          key={d.id}
                          {...dnd.cardProps(d.id)}
                          onClick={() => { if (!dnd.clickWasDrag()) setOpenId(d.id); }}
                          className={'bg-[#0E3257] border border-white/15 hover:border-[#FFD700]/50 rounded-xl p-2.5 mb-2 cursor-grab active:cursor-grabbing' + (dnd.draggingId === d.id ? ' opacity-40' : '')}
                        >
                          {b && <div className={'text-[10px] font-bold rounded-lg px-2 py-1 mb-1.5 ' + BALL_STYLES[b.cls]}>{b.label}</div>}
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white/50 text-[10px] font-semibold">{d.reference}</span>
                            <div className="flex items-center gap-1">
                              {verdictMap[d.id]?.verdict && <span className={'text-[9px] font-bold px-1.5 py-0.5 rounded-full ' + (VERDICT_PILL[verdictMap[d.id].verdict!] ?? VERDICT_PILL.PASS)}>{verdictMap[d.id].verdict}</span>}
                              <TierBadge r={d} />
                            </div>
                          </div>
                          <div className="text-white font-bold text-[13px]">{assetName(d)}</div>
                          <div className="text-[#FFD700] text-[11px] font-semibold mb-1">
                            {d.type === 'business' ? `Rev ${gbp(d.revenue)} · Profit ${gbp(d.net_profit)}` : `${d.deal_kind === 'development' ? 'GDV' : 'Value'} ${gbp(d.portfolio_value)}`}{d.asking_price ? ` · Ask ${gbp(d.asking_price)}` : ''}
                          </div>
                          <div className="flex gap-1 flex-wrap text-[9px] font-bold">
                            {flags > 0 && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full">{flags} flag{flags > 1 ? 's' : ''}</span>}
                            {cl.length > 0 && <span className="bg-[#FFD700]/20 text-[#FFD700] px-1.5 py-0.5 rounded-full">{cl.filter((i) => i.is_done).length}/{cl.length} steps</span>}
                            <span className="bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{(d.documents || []).length} docs</span>
                            {(d.secondary_stages ?? []).map((ss) => (
                              <span key={ss} className="bg-blue-500/25 text-blue-200 px-1.5 py-0.5 rounded-full">‖ {STAGES.find((s) => s.key === ss)?.label ?? ss}</span>
                            ))}
                            {relMap[d.id] && <span className="bg-emerald-400/25 text-emerald-200 px-1.5 py-0.5 rounded-full">◆ {relMap[d.id].status === 'released' ? 'live to members' : relMap[d.id].status.replace('_', ' ')}</span>}
                            {d.member_listed && !relMap[d.id] && <span className="bg-[#FFD700]/20 text-[#FFD700] px-1.5 py-0.5 rounded-full">★ members</span>}
                          </div>
                          <StageMoveSelect current={d.status} stages={STAGES} onMove={(stage) => moveDeal(d.id, stage)} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 text-[11px] uppercase tracking-wide text-left">
                  {['Momentum', 'Ref', 'Date', 'Type', 'Name', 'Asking', 'Score', 'Stage'].map((h) => <th key={h} className="px-3 py-2.5 border-b border-white/10">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((d) => {
                  const b = ballState(d);
                  const st = STAGES.find((s) => s.key === d.status);
                  return (
                    <tr key={d.id} onClick={() => setOpenId(d.id)} className="cursor-pointer hover:bg-white/5 text-white/85">
                      <td className="px-3 py-2.5 border-b border-white/5">{b ? <span className={'text-[10px] font-bold rounded-lg px-2 py-1 ' + BALL_STYLES[b.cls]}>{b.label}</span> : '-'}</td>
                      <td className="px-3 py-2.5 border-b border-white/5 font-bold">{d.reference}</td>
                      <td className="px-3 py-2.5 border-b border-white/5 text-white/50">{new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      <td className="px-3 py-2.5 border-b border-white/5">{d.type === 'business' ? 'Business' : 'Property'}</td>
                      <td className="px-3 py-2.5 border-b border-white/5">{assetName(d)}</td>
                      <td className="px-3 py-2.5 border-b border-white/5">{gbp(d.asking_price)}</td>
                      <td className="px-3 py-2.5 border-b border-white/5"><TierBadge r={d} /></td>
                      <td className="px-3 py-2.5 border-b border-white/5">{st?.label ?? d.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddDealModal onClose={() => setShowAdd(false)} onCreated={(id) => { setShowAdd(false); load(); setOpenId(id); }} />}
      {showThesis && <ThesisSettingsModal onClose={() => setShowThesis(false)} />}
      {showCRM && <CRMModal onClose={() => setShowCRM(false)} />}
      {showAlerts && <AlertsModal onClose={() => setShowAlerts(false)} />}

      {/* ============ DETAIL DRAWER ============ */}
      {open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-end" onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="w-full max-w-2xl bg-[#0E3257] h-full overflow-y-auto p-6 md:p-8">
            <button onClick={() => setOpenId(null)} className="float-right text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
            <h2 className="text-2xl font-serif font-bold text-[#FFD700]">{assetName(open)}</h2>
            <p className="text-white/50 text-xs mb-3">{open.reference} · {new Date(open.created_at).toLocaleDateString('en-GB')}{open.network_optin && <span className="text-[#FFD700]"> · buyer-network consent ✓</span>}</p>

            {relMap[open.id] ? (
              <a href="/admin/origination?view=dealflow" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold mb-2 bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 hover:bg-emerald-400/30">
                <Star className="h-3.5 w-3.5" /> {relMap[open.id].status === 'released' ? 'Live to members' : 'Members: ' + relMap[open.id].status.replace('_', ' ')} · {relMap[open.id].n_applied ?? 0} applied · {relMap[open.id].n_nda ?? 0} NDA'd - manage →
              </a>
            ) : (
              <a href={'/admin/origination?view=dealflow&submission=' + open.id} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold mb-2 bg-[#FFD700] text-[#0A2540] hover:brightness-95">
                <Star className="h-3.5 w-3.5" /> Release to members →
              </a>
            )}
            {open.member_listed && !open.network_optin && (
              <p className="text-amber-300 text-xs mb-2">⚠ Seller hasn't given buyer-network consent - get their OK before presenting.</p>
            )}

            <DealAnalysisPanel submissionId={open.id} status={open.status} score={latestScore(open)} scoresCount={(open.scores || []).length} onRescore={() => rescore(open.id)} />

            <Section title="Deal stage">
              <div className="flex gap-1.5 flex-wrap">
                {STAGES.map((s) => (
                  <button key={s.key} onClick={() => moveDeal(open.id, s.key)} className={'px-3 py-1.5 rounded-full text-xs font-semibold border ' + (open.status === s.key ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'text-white/75 border-white/25')}>{s.label}</button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-white/50 text-xs">Run in parallel:</span>
                {PARALLEL_STAGES.filter((s) => s !== open.status).map((s) => {
                  const on = (open.secondary_stages ?? []).includes(s);
                  return (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer text-xs text-white/80">
                      <input type="checkbox" checked={on} onChange={() => toggleParallel(open, s)} className="h-3.5 w-3.5 accent-[#FFD700]" />
                      {STAGES.find((x) => x.key === s)?.label}
                    </label>
                  );
                })}
              </div>
            </Section>

            <Section title="AI assistance for this stage">
              <div className="flex gap-2 flex-wrap mb-3">
                {Array.from(new Map(
                  [open.status, ...(open.secondary_stages ?? [])]
                    .flatMap((s) => STAGE_ASSISTS[s] ?? [])
                    .map(([k, label]) => [k, label] as [string, string]),
                ).entries()).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => runAssist(open, key)}
                    disabled={!!assistBusy}
                    className="bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-full text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {assistBusy === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {label}
                  </button>
                ))}
              </div>
              {msg && <p className="text-emerald-300 text-xs mb-2">{msg}</p>}
              {[...(open.deal_outputs ?? [])].sort((a, b) => (Number(b.selected) - Number(a.selected)) || (+new Date(b.created_at) - +new Date(a.created_at))).slice(0, 8).map((o: any) => (
                <OutputCard
                  key={o.id}
                  output={o}
                  onSave={(content: string) => saveOutput(o, content)}
                  onRefine={(instr: string) => runAssist(open, o.assist_key, instr, o.id)}
                  onSelect={() => selectOutput(open, o)}
                  onDelete={() => deleteOutput(o)}
                  onTrack={PLAN_STAGE[o.assist_key] ? () => trackAsChecklist(open, o) : undefined}
                  busy={assistBusy === o.assist_key + o.id}
                />
              ))}
            </Section>

            <ChecklistSection deal={open} onToggle={toggleItem} onDelete={deleteItem} onNote={saveItemNote} />
            <ItemsSection deal={open} onAdd={addItem} onToggle={toggleItem} onDelete={deleteItem} onNote={saveItemNote} />

            {/* Documents live in the Deal Agent's data room above (upload + auto-categorised + intelligent intake) */}
            {/* AI assessment is shown once, inside the Deal Agent panel above (Officially Invested framework) */}

            <Section title="Submission detail">
              <div className="grid grid-cols-2 gap-x-5">
                <KV k="Submitted by" v={`${open.submitter_name ?? ''} (${open.submitter_role ?? ''})`} />
                <KV k="Contact" v={`${open.email ?? ''} · ${open.phone ?? ''}`} />
                {open.type === 'business' ? (
                  <>
                    <KV k="Companies House" v={open.companies_house_number} />
                    <KV k="Sector" v={open.sector} />
                    <KV k="Region" v={open.region} />
                    <KV k="Employees" v={open.employees} />
                    <KV k="Revenue" v={gbp(open.revenue)} gold />
                    <KV k="Net profit" v={gbp(open.net_profit)} gold />
                    <KV k="Trend" v={open.revenue_trend} />
                    <KV k="Recurring" v={open.recurring_pct ? open.recurring_pct + '%' : null} />
                  </>
                ) : (
                  <>
                    <KV k="SPV" v={`${open.spv_name ?? ''} · ${open.companies_house_number ?? ''}`} />
                    <KV k={valueLabel(open)} v={gbp(open.portfolio_value)} gold />
                    <KV k="Type" v={open.property_type} />
                    <KV k="Units" v={open.num_units} />
                    <KV k="Locations" v={open.locations} />
                    <KV k="Gross rent" v={gbp(open.gross_rent)} />
                    <KV k="Debt" v={gbp(open.outstanding_debt)} />
                    <KV k="LTV" v={open.ltv ? open.ltv + '%' : null} />
                  </>
                )}
                <KV k="Asking price" v={gbp(open.asking_price)} gold />
                <KV k="Day-one cash need" v={gbp(open.day_one_cash_need)} gold />
                <KV k="Deal gap" v={open.asking_price && open.day_one_cash_need ? gbp(Number(open.asking_price) - Number(open.day_one_cash_need)) + ' for deferred terms' : null} gold />
                <KV k="Open to deferred" v={open.open_to_deferred} />
                <KV k="Reason for sale" v={open.reason_for_sale} />
              </div>
              {open.notes && <KV k="Notes from submitter" v={open.notes} />}
            </Section>

            {/* meetings & correspondence are handled in the Deal Agent panel above (Schedule call + Correspondence) */}
          </div>
        </div>
      )}
    </Shell>
  );
}

// ================= helpers =================

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0A2540] pt-0">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-white/55 text-[11px] font-bold uppercase tracking-wider mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

function KV({ k, v, gold }: { k: string; v: any; gold?: boolean }) {
  if (v == null || v === '' || v === '-' || v === ' · ') return null;
  return (
    <div className="py-1.5 border-b border-white/5">
      <div className="text-white/40 text-[10px] uppercase tracking-wide">{k}</div>
      <div className={'text-[13px] ' + (gold ? 'text-[#FFD700] font-bold' : 'text-white')}>{String(v)}</div>
    </div>
  );
}

const KIND_STYLES: Record<string, string> = {
  next_step: 'bg-[#FFD700]/20 text-[#FFD700]',
  red_flag: 'bg-red-500 text-white',
  clarification: 'bg-blue-500/30 text-blue-200',
  funding: 'bg-emerald-500/30 text-emerald-200',
  vendor_outstanding: 'bg-amber-500/25 text-amber-200',
  note: 'bg-white/10 text-white/70',
};

/** Minimal markdown → HTML for the branded letterhead (headings, bold, lists, tables, hr). */
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc(md).split('\n');
  let html = '', inUl = false, inTable = false;
  const closeAll = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inTable) { html += '</table>'; inTable = false; } };
  const inline = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const mark = (s: string) => s.replace(/\[TO CONFIRM:?\s*([^\]]*)\]/gi, '<mark style="background:#FFF3BF;color:#7a5b00;padding:1px 4px;border-radius:3px;font-weight:600;">[TO CONFIRM: $1]</mark>');
  for (const raw of lines) {
    const line = mark(raw.trimEnd());
    if (/^#{1,6}\s/.test(line)) { closeAll(); const lvl = (line.match(/^#+/) as RegExpMatchArray)[0].length; html += `<h${Math.min(lvl + 1, 6)}>${inline(line.replace(/^#+\s*/, ''))}</h${Math.min(lvl + 1, 6)}>`; continue; }
    if (/^---+$/.test(line)) { closeAll(); html += '<hr>'; continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) { if (!inUl) { closeAll(); html += '<ul>'; inUl = true; } html += `<li>${inline(line.replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>`; continue; }
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      if (!inTable) { closeAll(); html += '<table>'; inTable = true; }
      html += '<tr>' + line.slice(1, -1).split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('') + '</tr>';
      continue;
    }
    closeAll();
    if (line === '') html += '<div style="height:8px"></div>';
    else html += `<p>${inline(line)}</p>`;
  }
  closeAll();
  return html;
}

/** Strip anything after the internal-notes marker - internal commentary never leaves the building. */
function issuedContent(content: string): string {
  return content.split(/-{2,}\s*INTERNAL NOTES[^\n]*-{0,3}/i)[0].trimEnd();
}

const LETTERHEAD_CSS = `
    body { font-family: 'Open Sans', Calibri, -apple-system, sans-serif; color: #1a2433; font-size: 12.5px; line-height: 1.65; max-width: 760px; margin: 0 auto; padding: 24px; }
    .lh { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #FFD700; padding-bottom: 14px; margin-bottom: 26px; }
    .diamond { width: 26px; height: 26px; background: #FFD700; transform: rotate(45deg); }
    .lh .name { font-family: Georgia, serif; font-weight: 700; font-size: 19px; color: #0A2540; }
    .lh .tag { font-size: 10.5px; color: #5f6b7a; letter-spacing: 0.08em; text-transform: uppercase; }
    h1, h2, h3, h4 { font-family: Georgia, serif; color: #0A2540; line-height: 1.3; }
    h1 { font-size: 21px; } h2 { font-size: 17px; margin-top: 22px; border-bottom: 1px solid #e3e7ec; padding-bottom: 4px; } h3 { font-size: 14px; margin-top: 16px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; } td { border: 1px solid #d8dee6; padding: 6px 9px; }
    ul { margin: 4px 0; padding-left: 20px; } li { margin: 3px 0; }
    hr { border: none; border-top: 1px solid #e3e7ec; margin: 16px 0; }
    b { color: #0A2540; }
    .foot { margin-top: 34px; border-top: 1px solid #e3e7ec; padding-top: 10px; font-size: 10px; color: #8a94a0; }`;

function letterheadHtml(output: any): string {
  return `<div class="lh"><div class="diamond"></div><div><div class="name">Officially Invested</div><div class="tag">Private &amp; Confidential</div></div></div>
    ${mdToHtml(issuedContent(output.content))}
    <div class="foot">Officially Invested · officiallyinvested.com &nbsp;&nbsp;|&nbsp;&nbsp; Generated ${new Date(output.created_at).toLocaleDateString('en-GB')}</div>`;
}

/** Branded, editable Word document (.doc opens natively in Word/Pages/Google Docs). */
function downloadWordDoc(output: any) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${output.title}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page { size: A4; margin: 22mm 18mm; } ${LETTERHEAD_CSS}</style></head>
<body>${letterheadHtml(output)}</body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = output.title.replace(/[^a-zA-Z0-9 \-]/g, '').trim().replace(/\s+/g, '-') + '.doc';
  a.click();
  URL.revokeObjectURL(a.href);
}

function openBrandedPdf(output: any) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${output.title} - Officially Invested</title><style>
    @page { margin: 22mm 18mm; }
    ${LETTERHEAD_CSS}
    .diamond { clip-path: polygon(50% 0%,100% 50%,50% 100%,0% 50%); }
    @media print { .noprint { display: none; } }
  </style></head><body>
    ${letterheadHtml(output)}
    <div class="noprint" style="position:fixed;top:12px;right:12px;"><button onclick="window.print()" style="background:#0A2540;color:#FFD700;border:none;border-radius:999px;padding:10px 22px;font-weight:700;cursor:pointer;">Print / Save as PDF</button></div>
  </body></html>`);
  w.document.close();
}

function OutputCard({ output, onSave, onRefine, onSelect, onDelete, onTrack, busy }: {
  output: any;
  onSave: (content: string) => void;
  onRefine: (instructions: string) => void;
  onSelect: () => void;
  onDelete: () => void;
  onTrack?: () => void;
  busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'refine' | 'fill'>('view');
  const [draft, setDraft] = useState('');
  const [refineText, setRefineText] = useState('');
  const [fills, setFills] = useState<Record<string, string>>({});
  const copy = async () => {
    await navigator.clipboard.writeText(output.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const selectable = ['structure-proposal', 'hots-draft'].includes(output.assist_key);

  // every [TO CONFIRM: …] in the document, deduplicated, with the surrounding sentence for context
  const phItems: { label: string; context: string }[] = [];
  const phRegex = /\[TO CONFIRM:?\s*([^\]]*)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = phRegex.exec(output.content)) !== null) {
    const label = m[1].trim() || 'detail';
    if (phItems.some((p) => p.label === label)) continue;
    const start = Math.max(0, m.index - 70);
    const end = Math.min(output.content.length, m.index + m[0].length + 50);
    const ctx = output.content.slice(start, end).replace(/[#*>|]/g, '').replace(/\s+/g, ' ').trim();
    phItems.push({ label, context: ctx });
  }
  const placeholders = phItems.map((p) => p.label);

  const applyFills = (values: Record<string, string>) => {
    let next = output.content;
    for (const [label, value] of Object.entries(values)) {
      if (!value.trim()) continue;
      const re = new RegExp('\\[TO CONFIRM:?\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\]', 'gi');
      next = next.replace(re, value.trim());
    }
    onSave(next);
    setMode('view');
    setFills({});
  };
  const saveFills = () => applyFills(fills);
  const markAllRemainingNA = () => {
    const all: Record<string, string> = { ...fills };
    for (const p of placeholders) if (!all[p]?.trim()) all[p] = 'N/A';
    applyFills(all);
  };

  // render content with [TO CONFIRM] highlighted
  const segments = output.content.split(/(\[TO CONFIRM:?\s*[^\]]*\])/gi);

  const hasInternalNotes = /-{2,}\s*INTERNAL NOTES/i.test(output.content);

  // Pre-issue check before exporting an external/letterhead document
  const issueGuard = (action: () => void) => {
    if (placeholders.length === 0) { action(); return; }
    const list = placeholders.slice(0, 12).map((p, i) => `${i + 1}. ${p}`).join('\n');
    const more = placeholders.length > 12 ? `\n…and ${placeholders.length - 12} more` : '';
    if (confirm(`This document still needs ${placeholders.length} input${placeholders.length > 1 ? 's' : ''} before it's ready to issue:\n\n${list}${more}\n\nUse "Complete details" to fill them in.\n\nOpen the document anyway?`)) action();
  };
  return (
    <div className={'bg-white/5 border rounded-xl p-3.5 mb-2 ' + (output.selected ? 'border-[#FFD700]' : 'border-white/10')}>
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <button onClick={() => { setExpanded(!expanded); setMode('view'); }} className="text-white font-semibold text-sm text-left flex-1 hover:text-[#FFD700] min-w-[180px]">
          {output.selected && <span className="text-[#FFD700] mr-1.5">★ SELECTED</span>}
          {output.title}
          <span className="text-white/40 font-normal text-[11px] ml-2">
            {new Date(output.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {output.edited_at && ' · edited'}
          </span>
          {placeholders.length > 0 && (
            <span className="ml-2 bg-amber-400/20 text-amber-300 border border-amber-400/50 text-[10px] font-bold px-2 py-0.5 rounded-full">{placeholders.length} detail{placeholders.length > 1 ? 's' : ''} needed</span>
          )}
        </button>
        {selectable && (
          <button onClick={onSelect} className={'text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap ' + (output.selected ? 'bg-[#FFD700] text-[#0A2540]' : 'bg-white/10 text-white hover:bg-white/20')}>
            {output.selected ? 'Selected ✓' : output.assist_key === 'structure-proposal' ? 'Use this structure' : 'Make current HoTs'}
          </button>
        )}
        {placeholders.length > 0 && (
          <button onClick={() => { setMode(mode === 'fill' ? 'view' : 'fill'); setExpanded(true); }} className="bg-amber-400/20 text-amber-300 border border-amber-400/50 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-amber-400/30">Complete details</button>
        )}
        {onTrack && (
          <button onClick={onTrack} className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-emerald-500/30">Track as checklist</button>
        )}
        <button onClick={() => { setMode(mode === 'refine' ? 'view' : 'refine'); setExpanded(true); }} disabled={busy} className="bg-white/10 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full hover:bg-white/20 whitespace-nowrap disabled:opacity-50">{busy ? 'Revising…' : 'Refine with AI'}</button>
        <button onClick={() => { setMode(mode === 'edit' ? 'view' : 'edit'); setExpanded(true); setDraft(output.content); }} className="bg-white/10 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full hover:bg-white/20 whitespace-nowrap">{mode === 'edit' ? 'Cancel edit' : 'Edit'}</button>
        <button onClick={() => issueGuard(() => openBrandedPdf(output))} className="bg-[#FFD700] text-[#0A2540] text-[11px] font-bold px-3 py-1.5 rounded-full hover:bg-opacity-90 whitespace-nowrap">Branded PDF</button>
        <button onClick={() => issueGuard(() => downloadWordDoc(output))} className="bg-[#FFD700] text-[#0A2540] text-[11px] font-bold px-3 py-1.5 rounded-full hover:bg-opacity-90 whitespace-nowrap">Word</button>
        <button onClick={copy} className="bg-white/10 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full hover:bg-white/20 whitespace-nowrap">{copied ? 'Copied ✓' : 'Copy'}</button>
        <button onClick={onDelete} className="text-white/30 hover:text-white text-xs px-1" title="Delete">✕</button>
      </div>

      {mode === 'refine' && (
        <div className="mt-3 bg-[#081D33] border border-[#FFD700]/40 rounded-xl p-3">
          <p className="text-white/70 text-xs mb-2">Tell the AI exactly what to change - it revises this document, keeps everything else, and recalculates the numbers. Be specific:</p>
          <textarea
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            rows={4}
            placeholder={'e.g. Cash on completion is 50% of the purchase price. The remaining 50% is split: vendor loan note over 36 months at 6%, and an earn-out capped at £150,000 against EBITDA staying above £280k. Exclusivity 10 weeks.'}
            className="w-full bg-white/5 border border-white/20 text-white text-[12.5px] rounded-lg p-3 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FFD700] placeholder-white/30"
          />
          <div className="flex gap-2 mt-2 items-center">
            <button
              onClick={() => { if (refineText.trim()) { onRefine(refineText.trim()); setRefineText(''); setMode('view'); } }}
              disabled={busy || !refineText.trim()}
              className="bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50"
            >
              {busy ? 'Revising…' : 'Revise document'}
            </button>
            <span className="text-white/40 text-[11px]">A new version appears at the top; if this one is starred, the revision inherits the star.</span>
          </div>
        </div>
      )}

      {mode === 'fill' && (
        <div className="mt-3 bg-[#081D33] border border-amber-400/40 rounded-xl p-3.5">
          <p className="text-amber-300 text-xs font-semibold mb-1">Complete the document</p>
          <p className="text-white/50 text-[11px] mb-3.5">Answer each question below. Not sure or doesn't apply? Hit <b className="text-white/70">N/A</b>. Your answers are written straight into the document.</p>
          {phItems.map(({ label, context }, idx) => (
            <div key={label} className="mb-3.5 pb-3.5 border-b border-white/5 last:border-0">
              <label className="block text-white text-[12.5px] font-semibold mb-0.5">{idx + 1}. {label}</label>
              {context && <p className="text-white/35 text-[10.5px] mb-1.5 italic">…{context}…</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fills[label] ?? ''}
                  onChange={(e) => setFills((f) => ({ ...f, [label]: e.target.value }))}
                  placeholder="Type your answer"
                  className="flex-1 bg-white/5 border border-white/20 text-white text-[12.5px] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD700] placeholder-white/30"
                />
                <button onClick={() => setFills((f) => ({ ...f, [label]: 'N/A' }))} className="bg-white/10 text-white/70 px-3 rounded-lg text-xs font-semibold hover:bg-white/20 whitespace-nowrap">N/A</button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={saveFills} className="bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-full text-sm font-bold">Save answers into document</button>
            <button onClick={markAllRemainingNA} className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-semibold">Mark all remaining N/A & complete</button>
            <button onClick={() => setMode('view')} className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      {expanded && mode === 'view' && (placeholders.length > 0 || hasInternalNotes) && (
        <div className="mt-3 bg-amber-400/10 border border-amber-400/40 rounded-xl p-3">
          {placeholders.length > 0 && (
            <>
              <div className="text-amber-300 text-xs font-bold mb-1.5">Before issuing - {placeholders.length} key input{placeholders.length > 1 ? 's' : ''} needed:</div>
              <ul className="text-amber-200/90 text-[12px] list-disc pl-5 space-y-0.5">
                {placeholders.slice(0, 10).map((p, i) => <li key={i}>{p}</li>)}
                {placeholders.length > 10 && <li>…and {placeholders.length - 10} more</li>}
              </ul>
              <p className="text-white/40 text-[11px] mt-1.5">Use "Complete details" to fill these in. Tip: carry the agreed payment terms from your selected structure into the consideration section.</p>
            </>
          )}
          {hasInternalNotes && (
            <p className="text-white/45 text-[11px] mt-2">This document has internal notes that are <b className="text-white/60">automatically stripped</b> from the Branded PDF and Word exports - the seller never sees them.</p>
          )}
        </div>
      )}
      {expanded && mode === 'view' && (
        <pre className="text-white/80 text-[12.5px] whitespace-pre-wrap mt-3 font-sans leading-relaxed max-h-96 overflow-y-auto">
          {segments.map((seg: string, i: number) =>
            /^\[TO CONFIRM/i.test(seg)
              ? <mark key={i} className="bg-amber-400/30 text-amber-200 rounded px-1 font-semibold">{seg}</mark>
              : <span key={i}>{seg}</span>,
          )}
        </pre>
      )}

      {mode === 'edit' && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            className="w-full bg-[#081D33] border border-white/20 text-white text-[12.5px] rounded-xl p-3 font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onSave(draft); setMode('view'); }} className="bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-full text-sm font-bold">Save changes</button>
            <button onClick={() => setMode('view')} className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, onToggle, onDelete, onNote, showKind = true }: { item: any; onToggle: (i: any) => void; onDelete: (id: string) => void; onNote?: (id: string, note: string) => void; showKind?: boolean }) {
  const kindLabel = ITEM_KINDS.find((k) => k[0] === item.kind)?.[1] ?? item.kind;
  const [noting, setNoting] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  return (
    <div className="py-1.5 border-b border-white/5">
      <div className="flex items-start gap-2.5">
        <input type="checkbox" checked={item.is_done} onChange={() => onToggle(item)} className="mt-0.5 h-4 w-4 accent-[#FFD700] cursor-pointer" />
        {showKind && <span className={'text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5 ' + (KIND_STYLES[item.kind] ?? KIND_STYLES.note)}>{kindLabel}</span>}
        <span className={'flex-1 text-[13px] ' + (item.is_done ? 'text-white/35 line-through' : 'text-white')}>{item.content}</span>
        {onNote && (
          <button onClick={() => { setNoting(!noting); setNoteDraft(item.note ?? ''); }} className={'text-xs whitespace-nowrap ' + (item.note ? 'text-[#FFD700]' : 'text-white/30 hover:text-white')} title="Add a finding / note">
            {item.note ? '✎ note' : '+ note'}
          </button>
        )}
        <button onClick={() => onDelete(item.id)} className="text-white/30 hover:text-white text-xs">✕</button>
      </div>
      {!noting && item.note && <div className="ml-7 mt-1 text-[12px] text-[#FFD700]/80 bg-[#FFD700]/5 border-l-2 border-[#FFD700]/40 pl-2 py-0.5">{item.note}</div>}
      {noting && onNote && (
        <div className="ml-7 mt-1.5 flex gap-2">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onNote(item.id, noteDraft); setNoting(false); } }}
            placeholder="Finding / note - e.g. 'Checked: top council is 18% of revenue, contract to 2028'"
            className="flex-1 bg-white/5 border border-white/20 text-white text-[12px] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#FFD700] placeholder-white/30"
          />
          <button onClick={() => { onNote(item.id, noteDraft); setNoting(false); }} className="bg-[#FFD700] text-[#0A2540] px-3 rounded-lg text-xs font-bold">Save</button>
        </div>
      )}
    </div>
  );
}

function ChecklistSection({ deal, onToggle, onDelete, onNote }: { deal: Deal; onToggle: (i: any) => void; onDelete: (id: string) => void; onNote: (id: string, note: string) => void }) {
  const cl = checklist(deal);
  if (!cl.length) return null;
  const byStage: Record<string, any[]> = {};
  cl.forEach((i) => { (byStage[i.stage] = byStage[i.stage] || []).push(i); });
  return (
    <Section title={`Checklists & DD plans - ${cl.filter((i) => i.is_done).length}/${cl.length} done`}>
      {STAGES.filter((s) => byStage[s.key]).map((s) => (
        <div key={s.key}>
          <div className="text-[#FFD700]/70 text-[10px] font-bold uppercase tracking-wide mt-2 mb-0.5">{s.label}</div>
          {byStage[s.key].map((i) => <ItemRow key={i.id} item={i} onToggle={onToggle} onDelete={onDelete} onNote={onNote} showKind={false} />)}
        </div>
      ))}
      <p className="text-white/40 text-[11px] mt-2">Tick items and add findings as notes - then hit "Re-run assessment" and the AI re-reads progress, updates the red flags and tells you what's still outstanding.</p>
    </Section>
  );
}

function ItemsSection({ deal, onAdd, onToggle, onDelete, onNote }: { deal: Deal; onAdd: (dealId: string, kind: string, content: string) => void; onToggle: (i: any) => void; onDelete: (id: string) => void; onNote: (id: string, note: string) => void }) {
  const [kind, setKind] = useState('next_step');
  const [content, setContent] = useState('');
  const list = items(deal).sort((a, b) => Number(a.is_done) - Number(b.is_done));
  const submit = () => { onAdd(deal.id, kind, content); setContent(''); };
  return (
    <Section title="Working items - next steps, red flags, clarifications, funding, vendor">
      {list.map((i) => <ItemRow key={i.id} item={i} onToggle={onToggle} onDelete={onDelete} onNote={onNote} />)}
      <div className="flex gap-2 mt-3">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-2 text-sm w-36">
          {ITEM_KINDS.map(([k, label]) => <option key={k} value={k} className="bg-[#0A2540]">{label}</option>)}
        </select>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. Chase 2023 accounts · Confirm SDLT position"
          className="flex-1 bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 text-sm placeholder-white/35"
        />
        <button onClick={submit} className="bg-[#FFD700] text-[#0A2540] px-4 rounded-lg font-bold text-sm">Add</button>
      </div>
    </Section>
  );
}
