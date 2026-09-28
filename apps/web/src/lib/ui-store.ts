import { create } from 'zustand';
import { localKeys } from './local-data';

// Olympiads chosen for comparison. The list stays on this device until the user removes them.
function readComparison(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(localKeys.comparison()) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0))] : [];
  } catch { return []; }
}

type UIState = {
  comparisonIds: number[]; toggleComparison: (id: number) => void; removeFromComparison: (id: number) => void; clearComparison: () => void;
};
export const useUI = create<UIState>(set => {
  const save = (comparisonIds: number[]) => {
    try { localStorage.setItem(localKeys.comparison(), JSON.stringify(comparisonIds)); } catch { /* The choice still works until the app closes. */ }
    set({ comparisonIds });
  };
  return {
    comparisonIds: readComparison(),
    toggleComparison: id => { const ids = useUI.getState().comparisonIds; save(ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]); },
    removeFromComparison: id => save(useUI.getState().comparisonIds.filter(value => value !== id)),
    clearComparison: () => { if (useUI.getState().comparisonIds.length) save([]); },
  };
});
