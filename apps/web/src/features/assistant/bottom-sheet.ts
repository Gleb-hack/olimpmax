import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

const closeDelay = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200;

/**
 * The behaviour of a bottom sheet over the Olimp overview (the chat, «Ещё варианты»): a modal <dialog>, a slide-out
 * before `onClose`, and «pull the handle down to close». `focus` gets the focus on open instead of the first field,
 * so the on-screen keyboard does not pop up.
 */
export function useBottomSheet(onClose: () => void, focus: RefObject<HTMLElement | null>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ start: number; at: number; pointer: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  // Slide the sheet out, then leave its URL.
  const close = useCallback(() => {
    if (closeTimer.current !== undefined) return;
    setClosing(true); setDragOffset(null);
    closeTimer.current = window.setTimeout(onClose, closeDelay());
  }, [onClose]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    focus.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || closing || (event.target as HTMLElement).closest('button, a')) return;
    drag.current = { start: event.clientY, at: performance.now(), pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragOffset(0);
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointer === event.pointerId) setDragOffset(Math.max(0, event.clientY - drag.current.start));
  }
  function endDrag(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = null;
    const distance = Math.max(0, event.clientY - current.start);
    const speed = distance / Math.max(1, performance.now() - current.at);
    if (distance > 110 || (distance > 30 && speed > .6)) close(); else setDragOffset(null);
  }

  return {
    close, closing, dragging: dragOffset !== null,
    /** Spread on the <dialog>: Esc and a tap on the backdrop close the sheet with the animation. */
    dialogProps: {
      ref: dialog,
      onCancel: (event: { preventDefault: () => void }) => { event.preventDefault(); close(); },
      onClick: (event: { target: EventTarget; currentTarget: EventTarget }) => { if (event.target === event.currentTarget) close(); },
    },
    /** The panel follows the finger while it is pulled down. */
    panelStyle: dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined,
    /** Spread on the handle and the header. */
    dragProps: { onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag },
  };
}
