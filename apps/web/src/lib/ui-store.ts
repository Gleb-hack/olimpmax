import { create } from 'zustand';

type UIState = { comparisonIds: number[]; toggleComparison: (id: number) => void; clearComparison: () => void };
export const useUI = create<UIState>(set => ({
  comparisonIds: [],
  toggleComparison: id => set(state => ({ comparisonIds: state.comparisonIds.includes(id)
    ? state.comparisonIds.filter(value => value !== id)
    : state.comparisonIds.length < 2 ? [...state.comparisonIds, id] : state.comparisonIds })),
  clearComparison: () => set({ comparisonIds: [] }),
}));
