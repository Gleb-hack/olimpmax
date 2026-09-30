import { create } from 'zustand';
import { localKeys } from '../../lib/local-data';

function readPending() {
  try { return localStorage.getItem(localKeys.tourPending()) === '1'; } catch { return false; }
}
function writePending(value: boolean) {
  try {
    if (value) localStorage.setItem(localKeys.tourPending(), '1'); else localStorage.removeItem(localKeys.tourPending());
  } catch { /* Without storage the tour still runs; it just is not offered again after a restart. */ }
}

type TourState = {
  /** The shown step (index into tourSteps), or null when the tour is closed. */
  step: number | null;
  /** The tour is due: it starts as soon as the signed-in app is on screen, and again after a restart until it is closed. */
  pending: boolean;
  go: (step: number) => void;
  finish: () => void;
};
export const useTour = create<TourState>(set => ({
  step: null,
  pending: readPending(),
  go: step => set({ step }),
  finish: () => { writePending(false); set({ step: null, pending: false }); },
}));

/** Asks for the tour from the start: after registration and from «Помощь и FAQ». */
export function requestTour() {
  writePending(true);
  useTour.setState({ pending: true, step: 0 });
}
