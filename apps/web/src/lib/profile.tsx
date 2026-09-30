import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfilePatch } from '@olimp/contracts';
import { api } from './api';
import { useSession } from './session';

/** The goal (directions of study by code, universities by slug) is part of the preferences: «Сбросить» clears it too. */
export type LocalProfile = { name: string; avatar: string | null; grade: number | null; region: string; subjects: number[]; online: boolean; onsite: boolean; directions: string[]; universities: string[] };
const emptyProfile: LocalProfile = { name: '', avatar: null, grade: null, region: '', subjects: [], online: true, onsite: true, directions: [], universities: [] };
const Context = createContext<{ profile: LocalProfile; update: (patch: Partial<LocalProfile>) => Promise<boolean>; clear: () => Promise<boolean>; storageError: string | null; saving: boolean } | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, setUser, deletingAccount } = useSession();
  if (!user) throw new Error('Profile requires a signed-in user');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const client = useQueryClient();
  const queryKey = ['profile', user.id];
  const synced = useQuery({ queryKey, queryFn: ({ signal }) => api.currentProfile(signal),
    initialData: user, staleTime: 0, enabled: !saving && !deletingAccount, refetchOnWindowFocus: 'always', retry: false });
  useEffect(() => { if (synced.data) setUser(synced.data); }, [synced.data]);
  const busy = useRef(false);
  const mounted = useRef(true);
  // ProfileProvider is remounted for each account; ignore a request finishing after logout.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const profile: LocalProfile = { name: user.name, grade: user.grade, region: user.region, subjects: user.subjects, online: user.online, onsite: user.onsite, avatar: user.avatar,
    directions: user.directions ?? [], universities: user.universities ?? [] };
  async function update(patch: Partial<LocalProfile>) {
    if (busy.current) return false;
    busy.current = true; setSaving(true); setStorageError(null);
    try {
      await client.cancelQueries({ queryKey });
      const updated = await api.profile(ProfilePatch.parse(patch));
      if (!mounted.current) return false;
      client.setQueryData(queryKey, updated);
      setUser(updated);
      return true;
    } catch (cause) {
      setStorageError(cause instanceof z.ZodError ? cause.issues[0]?.message ?? 'Проверьте данные профиля.' : cause instanceof Error ? cause.message : 'Не удалось сохранить профиль. Попробуйте ещё раз.'); return false;
    } finally { busy.current = false; setSaving(false); }
  }
  return <Context.Provider value={{ profile, update, clear: () => { const { avatar: _, ...preferences } = emptyProfile; return update({ ...preferences, name: profile.name }); }, storageError, saving }}>{children}</Context.Provider>;
}
export function useProfile() { const value = useContext(Context); if (!value) throw new Error('ProfileProvider is missing'); return value; }
