// Shared drag-and-drop behaviour for the two pipeline boards (host + lite).
// Fixes the things that made "drag a deal to a column" silently fail:
//   * drop target = the whole column (boards stretch columns to full height)
//   * the target column is highlighted while a card hovers over it
//   * the board auto-scrolls sideways when dragging near either edge, so
//     off-screen columns are reachable (Safari never auto-scrolls on its own)
//   * the click that some browsers fire after a drop no longer opens the drawer
import { useCallback, useRef, useState, type DragEvent } from 'react';

const EDGE_PX = 72;     // how close to the edge before the board starts scrolling
const SCROLL_STEP = 16; // px per dragover tick (~every 50ms while hovering)

export function useKanbanDrag(onMove: (id: string, stage: string) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const justDropped = useRef(false);

  const autoScroll = useCallback((e: DragEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left + EDGE_PX) el.scrollLeft -= SCROLL_STEP;
    else if (e.clientX > r.right - EDGE_PX) el.scrollLeft += SCROLL_STEP;
  }, []);

  const finish = useCallback(() => {
    setDraggingId(null);
    setOverStage(null);
    // browsers may synthesise a click on the card right after a drop
    justDropped.current = true;
    setTimeout(() => { justDropped.current = false; }, 50);
  }, []);

  /** spread onto the horizontally scrolling board container */
  const containerProps = { ref: scrollRef, onDragOver: autoScroll };

  /** spread onto each column */
  const columnProps = (stage: string) => ({
    onDragEnter: (e: DragEvent) => { e.preventDefault(); setOverStage(stage); },
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overStage !== stage) setOverStage(stage); },
    onDragLeave: (e: DragEvent) => {
      // ignore moves between children of the same column
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOverStage((s) => (s === stage ? null : s));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || draggingId;
      finish();
      if (id) onMove(id, stage);
    },
  });

  /** spread onto each card */
  const cardProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(id);
    },
    onDragEnd: finish,
  });

  /** call at the top of a card's onClick; true = this click is the tail of a drag */
  const clickWasDrag = () => justDropped.current;

  return { containerProps, columnProps, cardProps, clickWasDrag, draggingId, overStage };
}

/** classes for a column, given the current drag state */
export function columnClass(base: string, stage: string, overStage: string | null, dragging: boolean) {
  if (overStage === stage) return base + ' border-[#FFD700]/70 bg-[#FFD700]/10';
  if (dragging) return base + ' border-dashed border-white/25';
  return base;
}
