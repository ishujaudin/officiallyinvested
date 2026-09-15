import { useRef, useState } from 'react';
import { Loader2, X, Sparkles, Paperclip } from 'lucide-react';
import { createDeal, dealIntake, getDealBySubmission, extractFile } from '../lib/acq';

// Add a deal - identical experience to the user pipeline (feature parity rule):
// default mode is conversational analyst intake (paste a website / Companies
// House link / description, attach NDAs, accounts, IMs), with manual entry as
// the second tab. For the host org the server writes a submission so it lands
// on the admin board with the brief in notes and gaps as clarification items.
export default function AddDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (submissionId: string) => void }) {
  const [mode, setMode] = useState<'analyst' | 'manual'>('analyst');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState('');
  const [result, setResult] = useState<any>(null);
  const [type, setType] = useState<'business' | 'property'>('business');
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }));
  const input = 'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/35 focus:border-[#FFD700]/60 outline-none';

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
      if (r.submission_id && files.length) {
        setPhase('Filing your documents on the deal…');
        try {
          const bundle = await getDealBySubmission(r.submission_id);
          const bridgeId = bundle?.deal?.id;
          if (bridgeId) for (const file of files) { try { await extractFile(bridgeId, file); } catch (_) { /* best effort */ } }
        } catch (_) { /* docs can be re-uploaded in the drawer */ }
      }
      setResult(r);
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false); setPhase('');
  };

  const submit = async () => {
    if (!f.name?.trim()) { setErr('Give the deal a name.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await createDeal({
        type, name: f.name, sector: f.sector, asking_price: f.asking_price,
        revenue: f.revenue, net_profit: f.net_profit, portfolio_value: f.portfolio_value,
        url: f.url, notes: f.notes,
      });
      onCreated(r.submission_id);
    } catch (e: any) { setErr(e.message || String(e)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[#0E3257] rounded-2xl p-6 border border-white/10 max-h-[90vh] overflow-y-auto">
        {!result ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-serif font-bold text-[#FFD700]">Add a deal</h3>
              <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setMode('analyst')} className={'px-4 py-1.5 rounded-full text-xs font-semibold border ' + (mode === 'analyst' ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'text-white/70 border-white/25')}>✦ Let the analyst read it</button>
              <button onClick={() => setMode('manual')} className={'px-4 py-1.5 rounded-full text-xs font-semibold border ' + (mode === 'manual' ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'text-white/70 border-white/25')}>Manual</button>
            </div>

            {mode === 'analyst' ? (
              <>
                <p className="text-white/50 text-[12.5px] mb-3">Paste the website, Companies House link or Google listing, or describe the business. Attach anything you have: NDA, accounts, the IM. You get the intake brief, the first score and the gaps as clarification items on the deal.</p>
                <textarea className={input + ' h-28 resize-none'} placeholder={'e.g. smithsplumbing.co.uk - met the owner at a trade show, he is 64 and wants out. Asking around £1.2m.'} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70 border border-white/25 rounded-full px-3 py-1.5 hover:border-white/50"><Paperclip className="h-3.5 w-3.5" /> Attach NDA, accounts, IM…</button>
                  <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,application/pdf,image/png,image/jpeg,text/plain,text/csv" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                  {files.map((file, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-white/10 text-white/80 rounded-full px-2.5 py-1">{file.name.slice(0, 24)}<button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-white/40 hover:text-white"><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
                <button onClick={research} disabled={busy || (!text.trim() && files.length === 0)} className="w-full mt-4 inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {phase || 'Working…'}</> : <><Sparkles className="h-4 w-4" /> Research and add to the pipeline</>}
                </button>
                <p className="text-white/35 text-[11px] mt-3">Takes 15 to 30 seconds. Documents are stored on the deal and feed every later analysis. No email is sent to any seller.</p>
              </>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  {(['business', 'property'] as const).map((t) => (
                    <button key={t} onClick={() => setType(t)} className={'px-4 py-1.5 rounded-full text-xs font-semibold capitalize border ' + (type === t ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'text-white/70 border-white/25')}>{t}</button>
                  ))}
                </div>
                <div className="flex flex-col gap-2.5">
                  <input className={input} placeholder={type === 'business' ? 'Business name' : 'Asset / SPV name'} value={f.name ?? ''} onChange={set('name')} />
                  <input className={input} placeholder="Sector (e.g. domiciliary care, plumbing)" value={f.sector ?? ''} onChange={set('sector')} />
                  {type === 'business' ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <input className={input} placeholder="Revenue £" inputMode="numeric" value={f.revenue ?? ''} onChange={set('revenue')} />
                      <input className={input} placeholder="Net profit £" inputMode="numeric" value={f.net_profit ?? ''} onChange={set('net_profit')} />
                    </div>
                  ) : (
                    <input className={input} placeholder="Portfolio / GDV value £" inputMode="numeric" value={f.portfolio_value ?? ''} onChange={set('portfolio_value')} />
                  )}
                  <input className={input} placeholder="Asking price £" inputMode="numeric" value={f.asking_price ?? ''} onChange={set('asking_price')} />
                  <input className={input} placeholder="Listing / source link (optional)" value={f.url ?? ''} onChange={set('url')} />
                  <textarea className={input} placeholder="Notes (optional)" rows={2} value={f.notes ?? ''} onChange={set('notes')} />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={submit} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add deal
                  </button>
                  <button onClick={onClose} className="px-4 py-2.5 rounded-full text-sm font-semibold text-white/75 border border-white/25">Cancel</button>
                </div>
                <p className="text-white/35 text-[11px] mt-3">Added as an internal origination - no email is sent to any seller. Upload accounts in the deal to get verified figures.</p>
              </>
            )}
            {err && <p className="text-red-300 text-xs mt-3">{err}</p>}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-serif font-bold text-[#FFD700]">{result.reference ?? 'Deal added'}</h3>
                <div className="text-white/40 text-[11px] mt-0.5">{result.ch_matched ? 'Matched to the official register · ' : ''}confidence {result.confidence}</div>
              </div>
              {result.score != null && <span className={'text-[12px] font-bold px-2.5 py-1 rounded-full ' + (result.score >= 65 ? 'bg-emerald-400/25 text-emerald-200' : 'bg-white/15 text-white/80')}>✦ {result.score} · {result.band}</span>}
            </div>
            <p className="text-white/80 text-[13.5px] leading-relaxed mt-3">{result.summary}</p>
            {result.missing_info?.length > 0 && (
              <div className="mt-4 bg-amber-400/10 border border-amber-400/30 rounded-xl p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-300 mb-2">What the analyst still needs · on the deal as clarifications</div>
                {result.missing_info.map((m: any, i: number) => (
                  <div key={i} className="text-[12.5px] text-white/75 py-1 flex gap-2"><span className="text-amber-300 font-bold shrink-0">{i + 1}.</span><span><b className="text-white/90">{m.item}</b>{m.why ? <span className="text-white/50"> - {m.why}</span> : null}</span></div>
                ))}
              </div>
            )}
            {files.length > 0 && <div className="text-white/50 text-[12px] mt-3">{files.length} document{files.length > 1 ? 's' : ''} filed on the deal and readable by the analyst.</div>}
            {result.submission_id ? (
              <button onClick={() => onCreated(result.submission_id)} className="w-full mt-4 inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90">Open the deal</button>
            ) : (
              // Non-host workspaces get a lite deal (no submission row), so there is
              // nothing to open on this board - say so instead of a silent no-op that
              // tempts people to submit the same deal again.
              <>
                <p className="text-white/60 text-[12.5px] mt-4">Added to your pipeline. Open it from <b className="text-white/85">Your Deal Pipeline</b>.</p>
                <button onClick={onClose} className="w-full mt-3 inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90">Done</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
