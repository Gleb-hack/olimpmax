import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isMock, type PlanPatch } from './api';

export const useFilters = () => useQuery({ queryKey: ['filters'], queryFn: api.filters, staleTime: 300_000 });
// Reference lists for the goal in the profile: they change only with a data import.
// The demo reads the same CSVs the API imports; they stay out of the API client bundle (see mock-reference.ts).
export const useUniversities = () => useQuery({ queryKey: ['universities'], staleTime: 3_600_000,
  queryFn: isMock ? async () => (await import('./mock-reference')).mockUniversities() : api.universities });
export const useDirections = () => useQuery({ queryKey: ['directions'], staleTime: 3_600_000,
  queryFn: isMock ? async () => (await import('./mock-reference')).mockDirections() : api.directions });
export const usePlan = () => useQuery({ queryKey: ['plan'], queryFn: api.plan, retry: false });
export const useNotifications = () => useQuery({ queryKey: ['notifications'], queryFn: api.notifications, retry: false });
export function useNotificationActions() {
  const client = useQueryClient();
  const toggle = useMutation({ mutationFn: api.setNotifications, onSuccess: data => client.setQueryData(['notifications'], data) });
  // A delivery result can change «bot connected» (MAX refused → not connected; delivered → connected).
  const test = useMutation({ mutationFn: api.testNotification, onSettled: () => client.invalidateQueries({ queryKey: ['notifications'] }) });
  return { toggle, test };
}
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
