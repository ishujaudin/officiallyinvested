// "Move to…" control on every pipeline card. Dragging is the fast path on a
// desktop, but HTML5 drag events never fire on Android touch and are fiddly on
// small screens - a native select opens the platform picker and works
// everywhere, keyboard included. Stops propagation so it never opens the drawer.
import type { ChangeEvent, MouseEvent } from 'react';

interface Stage { key: string; label: string; group?: string }

export default function StageMoveSelect({ current, stages, onMove }: { current: string; stages: Stage[]; onMove: (stage: string) => void }) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  const change = (e: ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const next = e.target.value;
    if (next && next !== current) onMove(next);
  };
  return (
    <select
      aria-label="Move to stage"
      title="Move to stage"
      value={current}
      onChange={change}
      onClick={stop}
      onMouseDown={stop}
      onTouchStart={(e) => e.stopPropagation()}
      className="mt-2 w-full bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white/80 hover:border-[#FFD700]/50 focus:outline-none focus:border-[#FFD700]/70"
    >
      {stages.map((s) => (
        <option key={s.key} value={s.key} className="text-[#0A2540]">{s.label}</option>
      ))}
    </select>
  );
}
