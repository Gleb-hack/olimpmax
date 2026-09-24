import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PlanPatch } from './api';

export const useFilters = () => useQuery({ queryKey: ['filters'], queryFn: api.filters, staleTime: 300_000 });
export const usePlan = () => useQuery({ queryKey: ['plan'], queryFn: api.plan, retry: false });
export const useEvents = () => useQuery({ queryKey: ['plan-events'], queryFn: api.events, retry: false });
export function usePlanActions() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['plan-action'],
    mutationFn: ({ id, action, patch }: { id: number; action: 'save' | 'remove' | 'patch'; patch?: PlanPatch }) =>
      action === 'save' ? api.save(id) : action === 'remove' ? api.remove(id) : api.patch(id, patch ?? {}),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['plan'] }), client.invalidateQueries({ queryKey: ['plan-events'] })]); },
  });
}
