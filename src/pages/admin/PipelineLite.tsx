// =============================================================================
// PipelineLite - the per-workspace pipeline for self-serve users.
// Built to the exact anatomy of the host Deal Pipeline: same stage set and
// groups (lib/stages), same header bar, six live KPIs, kanban/table toggle,
// filter pills, grouped 210px columns with eyebrows, rich cards, and the
// per-stage checklists. Adding a deal is conversational: paste a website or
// Companies House link, attach NDAs/accounts/IMs, and the analyst reads it,
// scores what it can and lists what it still needs. Only the admin machinery
// (submissions, member releases) is absent. Free forever; AI is the paywall.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X, Sparkles, Lock, Check, LogOut, RefreshCw, LayoutGrid, Table as TableIcon, Paperclip, Plus } from 'lucide-react';
import { liteDeals, liteDealCreate, liteDealUpdate, onboardScore, onboardStatus, crmList, crmAddTask, crmUpdateTask, crmDeleteTask, dealIntake, extractFile } from '../../lib/acq';
import { STAGES, TERMINAL_STAGES, CHECKLISTS, STAGE_ASSISTS, ITEM_KINDS, gbp } from '../../lib/stages';
import { useKanbanDrag, columnClass } from '../../components/kanban/useKanbanDrag';
import StageMoveSelect from '../../components/kanban/StageMoveSelect';
import Paywall, { CreditsTopUp } from '../../components/Paywall';
import { supabase } from '../../lib/supabase';
import DealAnalysisPanel from '../../components/DealAnalysisPanel';
import AlertsModal from '../../components/AlertsModal';
import ThesisSettingsModal from '../../components/ThesisSettingsModal';

const NAVY = '#0A2540';
const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#0A2540] bg-white';
const btnGold = 'inline-flex items-center gap-1.5 bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-lg text-sm font-bold hover:brightness-95 disabled:opacity-40';

const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;
const BOARD_STAGES = STAGES.filter((s) => !TERMINAL_STAGES.includes(s.key));
const staleDays = (d: any) => Math.floor((Date.now() - new Date(d.updated_at ?? d.created_at).getTime()) / 86400000);
const bandChip = (s: number) => s >= 80 ? 'bg-emerald-400/25 text-emerald-200' : s >= 65 ? 'bg-[#FFD700]/20 text-[#FFD700]' : s >= 50 ? 'bg-white/15 text-white/80' : 'bg-white/10 text-white/50';

export default function PipelineLite() {
  const [deals, setDeals] = useState<any[] | null>(null);
  const [plan, setPlan] = useState('free');
  const [email, setEmail] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [filter, setFilter] = useState('all');
  const [paywall, setPaywall] = useState<string | null>(null);
  const [topup, setTopup] = useState<'ai' | 'letter' | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showThesis, setShowThesis] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const f = (e: any) => setTopup(e.detail?.kind ?? 'ai');
    const g = () => setPaywall('The cockpit is yours. The AI analyst inside it joins on any paid plan');
    window.addEventListener('oi:topup', f);
    window.addEventListener('oi:paywall', g);
    return () => { window.removeEventListener('oi:topup', f); window.removeEventListener('oi:paywall', g); };
  }, []);
  const load = () => Promise.all([liteDeals(), onboardStatus()]).then(([d, st]) => { setDeals(d.deals); setPlan(st.plan ?? 'free'); setEmail(st.email ?? ''); }).catch((e) => setErr(e.message || String(e)));
  useEffect(() => { load(); }, []);
  const open = (deals ?? []).find((d) => d.id === openId) ?? null;
  const paid = plan !== 'free';

  const filtered = useMemo(() => {
    const ds = deals ?? [];
    if (filter === 'all') return ds;
    if (filter === 'deal_flow') return ds.filter((d) => d.source === 'deal_flow');
    return ds.filter((d) => (d.asset_type ?? 'business') === filter);
  }, [deals, filter]);

  const weekAgo = Date.now() - 7 * 864e5;
  const live = (deals ?? []).filter((d) => !TERMINAL_STAGES.includes(d.status));
  const kpis: [string, string | number][] = [
    ['New this week', (deals ?? []).filter((d) => +new Date(d.created_at) > weekAgo).length],
    ['Live deals', live.length],
    ['Opportunity value', gbp(live.reduce((a, d) => a + (Number(d.asking_price) || 0), 0))],
    ['No movement 7d+', live.filter((d) => staleDays(d) > 7).length],
    ['Open next steps', (deals ?? []).reduce((a, d) => a + (Number(d.open_tasks) || 0), 0)],
    ['Completed', (deals ?? []).filter((d) => d.status === 'completed').length],
  ];

  const moveDeal = async (id: string, status: string) => {
    if (!id) return;
    const deal = deals?.find((d) => d.id === id);
    if (!deal || deal.status === status) return;
    const prev = deal.status;
    // optimistic: move the card immediately, roll back if the save fails
    setDeals((ds) => ds?.map((d) => (d.id === id ? { ...d, status } : d)) ?? ds);
    try {
      await liteDealUpdate(id, { status });
    } catch (x: any) {
      setDeals((ds) => ds?.map((d) => (d.id === id ? { ...d, status: prev } : d)) ?? ds);
      setErr('Could not move the deal: ' + (x?.message || String(x)));
      return;
    }
    load();
  };
  const dnd = useKanbanDrag(moveDeal);

  return (
    <div className="min-h-screen" style={{ background: NAVY }}>
      {/* header bar - same anatomy as the host pipeline */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FFD700] rotate-45" style={{ clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }}></div>
          <div>
            <h1 className="text-xl font-serif font-bold text-[#FFD700]">Your Deal Pipeline</h1>
            <p className="text-white/40 text-xs">{email || (paid ? 'Your cockpit on every deal' : 'Free forever - the AI analyst joins on a paid plan')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/origination" className="bg-white/10 text-[#FFD700] border border-[#FFD700]/40 px-3 py-1.5 rounded-full text-sm font-semibold mr-1 hover:bg-white/15">Origination</a>
          <button onClick={() => setShowAlerts(true)} className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Alerts</button>
          <a href="/admin/crm" className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">CRM</a>
          <button onClick={() => setShowThesis(true)} className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Thesis</button>
          <a href="/admin/origination?view=about" className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Settings</a>
          <a href="/deals" className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Community deals</a>
          <button onClick={() => setAdding(true)} className="bg-[#FFD700] text-[#0A2540] px-3.5 py-1.5 rounded-full text-sm font-semibold hover:bg-opacity-90 mr-1">+ Add deal</button>
          <button onClick={load} className="text-white/60 hover:text-white p-2" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={async () => { await supabase?.auth.signOut(); window.location.href = '/signup'; }} className="text-white/60 hover:text-white p-2" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="px-6 py-5">
        {err && <div className="bg-red-500/15 border border-red-400/30 text-red-200 text-sm rounded-lg px-4 py-2.5 mb-4">{err}</div>}

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
          {[['all', 'All'], ['business', 'Businesses'], ['property', 'Property'], ['deal_flow', '◆ From deal flow']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={'px-4 py-1.5 rounded-full text-sm font-semibold border ' + (filter === k ? 'bg-white text-[#0A2540] border-white' : 'bg-white/5 text-white/70 border-white/15')}>{label}</button>
          ))}
        </div>

        {!deals ? (
          <div className="p-16 text-center"><Loader2 className="h-7 w-7 animate-spin text-[#FFD700] mx-auto" /></div>
        ) : view === 'kanban' ? (
          <div className="overflow-x-auto pb-3" {...dnd.containerProps}>
            {/* items-stretch + min height: every column is a full-height drop target, not just its cards */}
            <div className="flex gap-2.5 items-stretch min-w-max min-h-[60vh]">
              {BOARD_STAGES.map((s) => {
                const inStage = filtered.filter((d) => d.status === s.key);
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
                      const stale = staleDays(d);
                      const score = d.ch_snapshot?.acquisition_score;
                      const rev = d.ch_snapshot?.score_inputs?.revenue;
                      const eb = d.ch_snapshot?.score_inputs?.ebitda;
                      return (
                        <div
                          key={d.id}
                          {...dnd.cardProps(d.id)}
                          onClick={() => { if (!dnd.clickWasDrag()) setOpenId(d.id); }}
                          className={'bg-[#0E3257] border border-white/15 hover:border-[#FFD700]/50 rounded-xl p-2.5 mb-2 cursor-grab active:cursor-grabbing' + (dnd.draggingId === d.id ? ' opacity-40' : '')}
                        >
                          {stale > 7 && <div className="text-[10px] font-bold rounded-lg px-2 py-1 mb-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/30">With you · {stale}d - nudge it</div>}
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white/50 text-[10px] font-semibold">{new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                            {score != null && <span className={'text-[9px] font-bold px-1.5 py-0.5 rounded-full ' + bandChip(score)}>✦ {score} · {d.ch_snapshot?.score_band}</span>}
                          </div>
                          <div className="text-white font-bold text-[13px]">{d.name}</div>
                          <div className="text-[#FFD700] text-[11px] font-semibold mb-1">
                            {rev > 0 ? `Rev ${gbp(rev)}` : ''}{eb > 0 ? `${rev > 0 ? ' · ' : ''}Profit ${gbp(eb)}` : ''}{d.asking_price ? `${rev > 0 || eb > 0 ? ' · ' : ''}Ask ${gbp(d.asking_price)}` : ''}
                            {!(rev > 0) && !(eb > 0) && !d.asking_price && <span className="text-white/35 font-normal">{d.sector ?? 'add the numbers'}</span>}
                          </div>
                          <div className="flex gap-1 flex-wrap text-[9px] font-bold">
                            {Number(d.open_tasks) > 0 && <span className="bg-[#FFD700]/20 text-[#FFD700] px-1.5 py-0.5 rounded-full">{d.open_tasks} step{Number(d.open_tasks) > 1 ? 's' : ''}</span>}
                            <span className="bg-white/10 text-white/60 px-1.5 py-0.5 rounded-full">{Number(d.docs_count) || 0} docs</span>
                            {d.source === 'deal_flow' && <span className="bg-emerald-400/25 text-emerald-200 px-1.5 py-0.5 rounded-full">◆ from deal flow</span>}
                            {d.source === 'intake' && d.ch_snapshot?.intake && <span className="bg-blue-500/25 text-blue-200 px-1.5 py-0.5 rounded-full">✦ researched</span>}
                            {score == null && <span className="bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full">not scored</span>}
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
          <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-[13px] min-w-[720px]">
              <thead><tr className="text-white/50 text-[11px] uppercase tracking-wide border-b border-white/10">
                {['Deal', 'Stage', 'Sector', 'Ask', 'Score', 'Steps', 'Docs', 'Updated'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} onClick={() => setOpenId(d.id)} className="border-b border-white/[0.06] hover:bg-white/[0.04] cursor-pointer">
                    <td className="px-4 py-3 text-white font-semibold">{d.name}</td>
                    <td className="px-4 py-3 text-white/70">{stageLabel(d.status)}</td>
                    <td className="px-4 py-3 text-white/50">{d.sector ?? '-'}</td>
                    <td className="px-4 py-3 text-[#FFD700] font-semibold">{d.asking_price ? gbp(d.asking_price) : '-'}</td>
                    <td className="px-4 py-3">{d.ch_snapshot?.acquisition_score != null ? <span className={'text-[10px] font-bold px-1.5 py-0.5 rounded-full ' + bandChip(d.ch_snapshot.acquisition_score)}>✦ {d.ch_snapshot.acquisition_score}</span> : <span className="text-white/30">-</span>}</td>
                    <td className="px-4 py-3 text-white/70">{Number(d.open_tasks) || 0}</td>
                    <td className="px-4 py-3 text-white/70">{Number(d.docs_count) || 0}</td>
                    <td className="px-4 py-3 text-white/50">{new Date(d.updated_at ?? d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-white/40">No deals match this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {(deals ?? []).some((d) => TERMINAL_STAGES.includes(d.status)) && view === 'kanban' && (
          <div className="text-white/40 text-[12px] mt-4">Completed: {(deals ?? []).filter((d) => d.status === 'completed').length} · Passed: {(deals ?? []).filter((d) => d.status === 'passed').length} · Ineligible: {(deals ?? []).filter((d) => d.status === 'ineligible').length} (open any deal to change its stage)</div>
        )}
      </div>

      {adding && <DealIntake onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); load().then(() => id && setOpenId(id)); }} setErr={setErr} />}
      {open && <DealDrawer deal={open} paid={paid} onClose={() => setOpenId(null)} onChanged={load} onPaywall={(c) => setPaywall(c)} setErr={setErr} />}
      {paywall && <Paywall context={paywall} onClose={() => setPaywall(null)} />}
      {topup && <CreditsTopUp focus={topup} onClose={() => setTopup(null)} />}
      {showAlerts && <AlertsModal onClose={() => setShowAlerts(false)} />}
      {showThesis && <ThesisSettingsModal onClose={() => setShowThesis(false)} />}
    </div>
  );
}

// =============================================================================
// Conversational intake: paste a website / Companies House link / description,
// attach NDAs, accounts or IMs. The analyst reads everything, matches the
// official register, scores what it can and lists exactly what it still needs.
// =============================================================================
function DealIntake({ onClose, onSaved, setErr }: { onClose: () => void; onSaved: (dealId?: string) => void; setErr: (m: string) => void }) {
  const [mode, setMode] = useState<'analyst' | 'quick'>('analyst');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [result, setResult] = useState<any>(null);
  const [f, setF] = useState<any>({ name: '', sector: '', asking_price: '', asset_type: 'business' });
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size > 4.5 * 1024 * 1024) { setErr(`${file.name} is over 4.5MB. Attach a smaller copy.`); continue; }
      if (next.length >= 4) break;
      next.push(file);
    }
    setFiles(next);
  };
  const toB64 = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file); });

  const research = async () => {
    if (!text.trim() && files.length === 0) return;
    setBusy(true); setErr(''); setPhase('Reading what you gave me…');
    try {
      const attachments: any[] = [];
      for (const file of files) {
        if (/text\/|csv/.test(file.type)) attachments.push({ file_name: file.name, media_type: file.type, text: await file.text() });
        else attachments.push({ file_name: file.name, media_type: file.type || 'application/pdf', base64: await toB64(file) });
      }
      setPhase('Researching the business, matching the register, scoring…');
      const r = await dealIntake({ text: text.trim(), attachments });
      setPhase(files.length ? 'Filing your documents on the deal…' : '');
      for (const file of files) { try { await extractFile(r.deal.id, file); } catch (_) { /* doc parse is best effort here */ } }
      setResult(r);
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false); setPhase('');
  };

  const quickAdd = async () => {
    setBusy(true); setErr('');
    try { const r = await liteDealCreate({ name: f.name, sector: f.sector || null, asset_type: f.asset_type, asking_price: f.asking_price ? Number(String(f.asking_price).replace(/[^0-9.]/g, '')) : null }); onSaved(r.deal?.id); }
    catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {!result ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="font-serif font-bold text-lg text-gray-900">Add a deal</div>
              <button onClick={onClose} className="text-gray-300 hover:text-gray-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-1.5 mb-4 mt-2">
              <button onClick={() => setMode('analyst')} className={'text-[12px] font-bold px-3 py-1.5 rounded-full ' + (mode === 'analyst' ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-gray-500')}>✦ Let the analyst read it</button>
              <button onClick={() => setMode('quick')} className={'text-[12px] font-bold px-3 py-1.5 rounded-full ' + (mode === 'quick' ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-gray-500')}>Quick add</button>
            </div>
            {mode === 'analyst' ? (
              <>
                <p className="text-[12.5px] text-gray-500 mb-3">Paste the website, Companies House link or Google listing, or just describe the business. Attach anything you have: NDA, accounts, the IM. The analyst reads it all, matches the official register, gives the first score and tells you exactly what to chase next.</p>
                <textarea className={input + ' w-full h-28 resize-none'} placeholder={'e.g. smithsplumbing.co.uk - met the owner at a trade show, he is 64 and wants out. Asking around £1.2m.'} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 border border-gray-300 rounded-full px-3 py-1.5 hover:bg-gray-50"><Paperclip className="h-3.5 w-3.5" /> Attach NDA, accounts, IM…</button>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,application/pdf,image/png,image/jpeg,text/plain,text/csv" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  {files.map((file, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">{file.name.slice(0, 24)}<button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
                <button className={btnGold + ' w-full mt-4 justify-center'} disabled={busy || (!text.trim() && files.length === 0)} onClick={research}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {phase || 'Working…'}</> : <><Sparkles className="h-4 w-4" /> Research and add to my pipeline</>}
                </button>
                <p className="text-[11px] text-gray-400 mt-2 text-center">Takes 15 to 30 seconds. Documents are stored on the deal and feed every later analysis.</p>
              </>
            ) : (
              <>
                <input className={input + ' w-full'} placeholder="Business name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <div className="flex gap-2 mt-2.5">
                  {[['business', 'Business'], ['property', 'Property']].map(([k, label]) => (
                    <button key={k} onClick={() => setF({ ...f, asset_type: k })} className={'flex-1 text-sm font-semibold rounded-lg border px-3 py-2 ' + (f.asset_type === k ? 'bg-[#0A2540] text-white border-[#0A2540]' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>{label}</button>
                  ))}
                </div>
                <input className={input + ' w-full mt-2.5'} placeholder="Sector (optional)" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} />
                <input className={input + ' w-full mt-2.5'} placeholder="Asking price £ (optional)" value={f.asking_price} onChange={(e) => setF({ ...f, asking_price: e.target.value })} />
                <button className={btnGold + ' w-full mt-4 justify-center'} disabled={busy || !f.name.trim()} onClick={quickAdd}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add to pipeline'}</button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-serif font-bold text-lg text-gray-900">{result.deal?.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{result.ch_matched ? 'Matched to the official register · ' : ''}confidence {result.confidence}</div>
              </div>
              {result.score != null && <span className={'text-[13px] font-bold px-2.5 py-1 rounded-full ' + (result.score >= 65 ? 'bg-emerald-600 text-white' : 'bg-[#0A2540] text-white')}>✦ {result.score} · {result.band}</span>}
            </div>
            <p className="text-[13.5px] text-gray-700 leading-relaxed mt-3">{result.summary}</p>
            {result.missing_info?.length > 0 && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-2">What the analyst still needs · added as tasks on the deal</div>
                {result.missing_info.map((m: any, i: number) => (
                  <div key={i} className="text-[12.5px] text-gray-700 py-1 flex gap-2"><span className="text-amber-500 font-bold shrink-0">{i + 1}.</span><span><b>{m.item}</b>{m.why ? <span className="text-gray-500"> - {m.why}</span> : null}</span></div>
                ))}
              </div>
            )}
            {files.length > 0 && <div className="text-[12px] text-gray-500 mt-3">{files.length} document{files.length > 1 ? 's' : ''} filed on the deal and readable by the analyst.</div>}
            <button className={btnGold + ' w-full mt-4 justify-center'} onClick={() => onSaved(result.deal?.id)}>Open the deal</button>
          </>
        )}
      </div>
    </div>
  );
}

function DealDrawer({ deal, paid, onClose, onChanged, onPaywall, setErr }: { deal: any; paid: boolean; onClose: () => void; onChanged: () => void; onPaywall: (c: string) => void; setErr: (m: string) => void }) {
  const snap = deal.ch_snapshot ?? {};
  const [si, setSi] = useState<any>(snap.score_inputs ?? { oldest_director_age: '', revenue: '', ebitda: '', incorporated_on: '', accounts_current: true, seller_engaged: false, asset_backing: 'none' });
  const [busy, setBusy] = useState(false);
  const [showScore, setShowScore] = useState(snap.acquisition_score == null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskDraft, setTaskDraft] = useState('');
  const loadTasks = () => crmList().then((r) => setTasks((r.tasks || []).filter((t: any) => t.deal_id === deal.id))).catch(() => {});
  useEffect(() => { loadTasks(); }, [deal.id]);
  const [taskKind, setTaskKind] = useState('next_step');
  const addTask = async (title?: string, kind?: string) => { const t = (title ?? taskDraft).trim(); if (!t) return; await crmAddTask({ deal_id: deal.id, title: t, kind: kind ?? taskKind }).catch((e: any) => setErr(e.message)); setTaskDraft(''); loadTasks(); };
  const toggleTask = async (id: string) => { await crmUpdateTask(id, { toggle: true }).catch((e: any) => setErr(e.message)); loadTasks(); };
  const noteTask = async (t: any) => { const n = window.prompt('Note on this item', t.meta?.note ?? ''); if (n === null) return; await crmUpdateTask(t.id, { note: n }).catch((e: any) => setErr(e.message)); loadTasks(); };
  const removeTask = async (id: string) => { await crmDeleteTask(id).catch((e: any) => setErr(e.message)); setTasks((x) => x.filter((y) => y.id !== id)); };
  const KIND_TINT: Record<string, string> = { next_step: 'bg-[#FFD700]/15 text-[#FFD700] border-[#FFD700]/30', red_flag: 'bg-red-500/25 text-red-200 border-red-400/40', clarification: 'bg-amber-400/20 text-amber-200 border-amber-400/40', funding: 'bg-pink-400/20 text-pink-200 border-pink-400/40', vendor_outstanding: 'bg-blue-400/20 text-blue-200 border-blue-400/40', note: 'bg-white/10 text-white/60 border-white/20' };
  const score = async () => {
    setBusy(true);
    try {
      await onboardScore({ oldest_director_age: Number(si.oldest_director_age) || 0, revenue: Number(si.revenue) || 0, ebitda: Number(si.ebitda) || 0, incorporated_on: si.incorporated_on || null, accounts_current: si.accounts_current, seller_engaged: si.seller_engaged, asset_backing: si.asset_backing }, deal.id);
      setShowScore(false); onChanged();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const chipCls = (active: boolean) => 'text-[12px] px-3.5 py-1.5 rounded-full border font-semibold transition ' + (active ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'border-white/25 text-white/75 hover:border-white/50 hover:text-white');
  const assist = STAGE_ASSISTS[deal.status]?.[0]?.[1] ?? 'Full analysis';
  const suggestions = (CHECKLISTS[deal.status] ?? []).filter((c) => !tasks.some((t) => t.title === c)).slice(0, 4);
  const intake = snap.intake;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-4xl h-full overflow-y-auto p-8" style={{ background: 'linear-gradient(160deg,#0A2540,#0C2B4A)' }} onClick={(e) => e.stopPropagation()}>
        {/* header - the same anatomy as the host pipeline */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif font-bold text-[26px] text-[#FFD700] leading-tight">{deal.name}</h2>
            <div className="text-white/40 text-[12px] mt-1">{new Date(deal.created_at).toLocaleDateString('en-GB')}{deal.sector ? ' · ' + deal.sector : ''}{deal.asking_price ? ' · Ask ' + gbp(deal.asking_price) : ''}{intake?.ch?.number ? ' · CH ' + intake.ch.number : ''}</div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>

        {/* intake brief, when the analyst researched it */}
        {intake?.summary && (
          <div className="mt-5 bg-white/[0.05] border border-white/10 rounded-2xl p-4">
            <div className="text-white/40 text-[10px] font-bold uppercase tracking-[0.15em] font-serif mb-1.5">Analyst intake brief · confidence {intake.confidence}</div>
            <p className="text-white/80 text-[13px] leading-relaxed">{intake.summary}</p>
          </div>
        )}

        {/* deal stage - the full stage set, grouped like the host board */}
        <div className="mt-7">
          <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif mb-2.5">Deal stage</div>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button key={s.key} onClick={async () => { await liteDealUpdate(deal.id, { status: s.key }).catch((e: any) => setErr(e.message)); onChanged(); }}
                className={chipCls(deal.status === s.key)}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* AI assistance for this stage */}
        <div className="mt-7">
          <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif mb-2.5">AI assistance for this stage</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { if (!paid) { onPaywall('The AI analyst reads the accounts, stress-tests the deal and writes your documents'); return; } document.getElementById('lite-cockpit')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="bg-[#FFD700] text-[#0A2540] text-[13px] font-bold px-5 py-2.5 rounded-full hover:brightness-95 transition">{assist}</button>
            {!paid && <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50 self-center"><Lock className="h-3 w-3" /> unlocks with any paid plan</span>}
          </div>
        </div>

        {/* acquisition score - free, styled into the dark chrome */}
        <div className="mt-7 bg-white/[0.05] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-white flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#FFD700]" /> Acquisition Score <span className="text-[9px] font-bold text-emerald-300 bg-emerald-400/15 border border-emerald-400/30 px-1.5 py-0.5 rounded-full uppercase">Free</span></div>
            <div className="flex items-center gap-3">
              {snap.acquisition_score != null && <span className="font-serif font-bold text-2xl text-[#FFD700]">{snap.acquisition_score}<span className="text-[12px] text-white/40 font-sans"> · {snap.score_band}</span></span>}
              <button className="text-[11px] text-white/50 underline underline-offset-2 hover:text-white" onClick={() => setShowScore((v) => !v)}>{showScore ? 'hide inputs' : snap.acquisition_score != null ? 're-score' : 'score it'}</button>
            </div>
          </div>
          {snap.score_breakdown && !showScore && (
            <div className="mt-2.5">{snap.score_breakdown.map((b: any, i: number) => (
              <div key={i} className="flex justify-between text-[12px] text-white/60 py-0.5"><span>{b.part}</span><span className="font-semibold text-white/80">{b.pts}/{b.max}</span></div>
            ))}</div>
          )}
          {showScore && (
            <>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[['oldest_director_age', 'Oldest director age'], ['incorporated_on', 'Incorporated YYYY-MM-DD'], ['revenue', 'Revenue £'], ['ebitda', 'Adj EBITDA £']].map(([k, ph]) => (
                  <input key={k} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#FFD700]/60" placeholder={ph} value={si[k]} onChange={(e) => setSi({ ...si, [k]: e.target.value })} />
                ))}
                <select className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white outline-none [&>option]:text-gray-900" value={si.asset_backing} onChange={(e) => setSi({ ...si, asset_backing: e.target.value })}>
                  <option value="none">No asset backing</option><option value="partial">Some property/plant</option><option value="full">Freehold / asset-rich</option>
                </select>
                <div className="flex flex-col gap-1 text-[12px] text-white/60 justify-center">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.accounts_current} onChange={(e) => setSi({ ...si, accounts_current: e.target.checked })} /> Accounts current</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.seller_engaged} onChange={(e) => setSi({ ...si, seller_engaged: e.target.checked })} /> Seller engaged</label>
                </div>
              </div>
              <button className={btnGold + ' w-full mt-3 justify-center'} disabled={busy} onClick={score}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : snap.acquisition_score != null ? 'Re-score' : 'Get my Acquisition Score'}</button>
            </>
          )}
        </div>

        {/* working items - identical anatomy to the host drawer */}
        <div className="mt-7">
          <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif mb-2.5">Working items - next steps, red flags, clarifications, funding, vendor</div>
          {tasks.length === 0 && <div className="text-white/35 text-[12.5px] mb-2">Nothing outstanding. Add the next move so it never slips.</div>}
          {tasks.map((t) => {
            const kind = t.meta?.kind ?? 'next_step';
            const done = t.status === 'done';
            return (
              <div key={t.id} className="flex items-start gap-2.5 py-2 border-b border-white/[0.07] group">
                <button onClick={() => toggleTask(t.id)} className={'mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center ' + (done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/30 text-transparent hover:border-emerald-400')} title={done ? 'Reopen' : 'Mark done'}><Check className="h-3 w-3" /></button>
                <span className={'inline-flex text-[9px] font-bold border rounded-full px-2 py-0.5 uppercase mt-0.5 shrink-0 ' + (KIND_TINT[kind] ?? KIND_TINT.note)}>{(ITEM_KINDS.find(([k]) => k === kind)?.[1]) ?? 'Note'}</span>
                <div className={'text-[13px] leading-relaxed flex-1 min-w-0 ' + (done ? 'text-white/35 line-through' : 'text-white/85')}>
                  {t.title}{t.due_date && !done && <span className="text-white/35 text-[11px] ml-2 no-underline">due {String(t.due_date).slice(0, 10)}</span>}
                  {t.meta?.note && <div className="text-white/45 text-[11.5px] italic mt-0.5">{t.meta.note}</div>}
                </div>
                <button onClick={() => noteTask(t)} className="text-white/30 hover:text-[#FFD700] text-[11px] shrink-0 mt-0.5">+ note</button>
                <button onClick={() => removeTask(t.id)} className="text-white/25 hover:text-red-400 shrink-0 mt-0.5" title="Remove"><X className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="text-white/30 text-[10px] font-bold uppercase tracking-wide mb-1.5">The playbook for {stageLabel(deal.status)}</div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((c) => (
                  <button key={c} onClick={() => addTask(c)} className="inline-flex items-center gap-1 text-[11px] text-white/60 border border-white/20 rounded-full px-2.5 py-1 hover:border-[#FFD700]/50 hover:text-[#FFD700]"><Plus className="h-3 w-3" /> {c}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <select className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-2.5 text-sm text-white outline-none [&>option]:text-gray-900" value={taskKind} onChange={(e) => setTaskKind(e.target.value)}>
              {ITEM_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <input className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#FFD700]/60" placeholder="e.g. Chase 2023 accounts · Confirm SDLT position" value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
            <button className={btnGold} onClick={() => addTask()}>Add</button>
          </div>
        </div>

        {/* the full cockpit - identical instrument, AI gated on free */}
        <div className="mt-7" id="lite-cockpit">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif">Deal cockpit - documents, analysis, people, history</div>
            {!paid && <button onClick={() => onPaywall('The cockpit is yours. The AI analyst inside it joins on any paid plan')} className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#FFD700] text-[#0A2540] px-2 py-0.5 rounded-full uppercase tracking-wide"><Lock className="h-2.5 w-2.5" /> AI unlocks with a plan</button>}
          </div>
          <div className="bg-white rounded-2xl p-4">
            <DealAnalysisPanel dealId={deal.id} locked={!paid} />
          </div>
        </div>

        {/* deal detail footer */}
        <div className="mt-7 pt-5 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
          {[['Sector', deal.sector ?? '-'], ['Asking price', deal.asking_price ? gbp(deal.asking_price) : '-'], ['Source', deal.source === 'deal_flow' ? 'Member deal flow' : deal.source === 'intake' ? 'Analyst intake' : deal.source ?? 'manual'], ['Added', new Date(deal.created_at).toLocaleDateString('en-GB')]].map(([k, v]) => (
            <div key={k as string}><div className="text-white/35 text-[10px] font-bold uppercase tracking-wide">{k}</div><div className="text-[#FFD700] text-[14px] font-semibold mt-0.5">{v}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
