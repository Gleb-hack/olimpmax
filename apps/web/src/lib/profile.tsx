import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, ProfilePatch, ProfilePreferences } from '@olimp/contracts';
import { api } from './api';
import { localKeys } from './local-data';
import { useSession } from './session';

/** The goal (directions of study by code, universities by slug) is part of the preferences: «Сбросить» clears it too. */
export type LocalProfile = { name: string; avatar: string | null; grade: number | null; region: string; subjects: number[]; online: boolean; onsite: boolean; directions: string[]; universities: string[] };
export const emptyProfile: LocalProfile = { name: '', avatar: null, grade: null, region: '', subjects: [], online: true, onsite: true, directions: [], universities: [] };
const LegacyProfile = ProfilePreferences.extend({ name: z.string().max(80).default(''), avatar: Avatar.default(null),
  directions: z.array(z.string()).default([]), universities: z.array(z.string()).default([]) });
const Context = createContext<{ profile: LocalProfile; update: (patch: Partial<LocalProfile>) => Promise<boolean>; clear: () => Promise<boolean>; storageError: string | null; saving: boolean; legacyAvatar: string | null; legacy: LocalProfile | null; importLegacy: () => Promise<void> } | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, setUser, deletingAccount } = useSession();
  if (!user) throw new Error('Profile requires a signed-in user');
  const avatarKey = localKeys.avatar(user);
  const migrationKey = localKeys.preferencesImported(user);
  const [legacy, setLegacy] = useState<LocalProfile | null>(() => {
    try {
      if (localStorage.getItem(migrationKey)) return null;
      // Use the server-verified identity to find this account's old local preferences.
      return LegacyProfile.parse(JSON.parse(localStorage.getItem(localKeys.legacyPreferences(user)) ?? 'null'));
    } catch { return null; }
  });
  const [legacyAvatar, setLegacyAvatar] = useState<string | null>(() => {
    try { return Avatar.parse(JSON.parse(localStorage.getItem(avatarKey) ?? 'null')) ?? legacy?.avatar ?? null; } catch { return null; }
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const client = useQueryClient();
  const queryKey = ['profile', user.id];
  const synced = useQuery({ queryKey, queryFn: ({ signal }) => api.currentProfile(signal),
    initialData: user, staleTime: 0, enabled: !saving && !deletingAccount, refetchOnWindowFocus: 'always', retry: false });
  useEffect(() => { if (synced.data) setUser(synced.data); }, [synced.data]);
  useEffect(() => {
    if (user.avatar !== null) {
      setLegacyAvatar(null);
      try { localStorage.removeItem(avatarKey); } catch { /* Old storage may be unavailable. */ }
    }
  }, [user.avatar, avatarKey]);
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
      if (patch.avatar !== undefined) {
        setLegacyAvatar(null);
        try { localStorage.removeItem(avatarKey); } catch { /* The server already saved the photo. */ }
      }
      return true;
    } catch (cause) {
      setStorageError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль. Попробуйте ещё раз.'); return false;
    } finally { busy.current = false; setSaving(false); }
  }
  async function importLegacy() {
    if (legacy && await update({ ...legacy, avatar: profile.avatar ?? legacy.avatar, name: legacy.name.trim() || profile.name })) {
      try { localStorage.setItem(migrationKey, 'done'); } catch { /* The server has already saved the preferences. */ }
      setLegacy(null);
    }
  }
  return <Context.Provider value={{ profile, update, clear: () => { const { avatar: _, ...preferences } = emptyProfile; return update({ ...preferences, name: profile.name }); }, storageError, saving, legacyAvatar, legacy, importLegacy }}>{children}</Context.Provider>;
}
export function useProfile() { const value = useContext(Context); if (!value) throw new Error('ProfileProvider is missing'); return value; }
