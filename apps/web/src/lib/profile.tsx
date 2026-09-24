import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { ProfilePatch, ProfilePreferences } from '@olimp/contracts';
import { api, isMock } from './api';
import { useSession } from './session';

const Avatar = z.string().max(1500000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable();
export type LocalProfile = { name: string; avatar: string | null; grade: number | null; region: string; subjects: number[]; online: boolean; onsite: boolean };
export const emptyProfile: LocalProfile = { name: '', avatar: null, grade: null, region: '', subjects: [], online: true, onsite: true };
const LegacyProfile = ProfilePreferences.extend({ name: z.string().max(80).default(''), avatar: Avatar.default(null) });
const Context = createContext<{ profile: LocalProfile; update: (patch: Partial<LocalProfile>) => Promise<boolean>; clear: () => Promise<boolean>; storageError: string | null; saving: boolean; legacy: LocalProfile | null; importLegacy: () => Promise<void> } | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useSession();
  if (!user) throw new Error('Profile requires a signed-in user');
  const avatarKey = `olimp.avatar.v1.${isMock ? 'mock' : user.id}`;
  const migrationKey = `olimp.preferences.imported.v1.${isMock ? 'mock' : user.id}`;
  const [legacy, setLegacy] = useState<LocalProfile | null>(() => {
    try {
      if (localStorage.getItem(migrationKey)) return null;
      // Use the server-verified identity to find this account's old local preferences.
      const scope = isMock ? 'mock' : user.maxUserId === 'local-demo' ? 'browser' : user.maxUserId;
      return LegacyProfile.parse(JSON.parse(localStorage.getItem(`olimp.preferences.v1.${scope}`) ?? 'null'));
    } catch { return null; }
  });
  const [avatar, setAvatar] = useState<string | null>(() => {
    try { return Avatar.parse(JSON.parse(localStorage.getItem(avatarKey) ?? 'null')) ?? legacy?.avatar ?? null; } catch { return null; }
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  // ProfileProvider is remounted for each account; ignore a request finishing after logout.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const profile: LocalProfile = { name: user.name, grade: user.grade, region: user.region, subjects: user.subjects, online: user.online, onsite: user.onsite, avatar };
  async function update(patch: Partial<LocalProfile>) {
    if (busy.current) return false;
    busy.current = true; setSaving(true); setStorageError(null);
    try {
      const { avatar: nextAvatar, ...preferences } = patch;
      if (Object.keys(preferences).length) {
        const updated = await api.profile(ProfilePatch.parse(preferences));
        if (!mounted.current) return false;
        setUser(updated);
      }
      if (nextAvatar !== undefined) {
        const checked = Avatar.parse(nextAvatar);
        localStorage.setItem(avatarKey, JSON.stringify(checked)); setAvatar(checked);
      }
      return true;
    } catch (cause) {
      setStorageError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль. Попробуйте ещё раз.'); return false;
    } finally { busy.current = false; setSaving(false); }
  }
  async function importLegacy() {
    if (legacy && await update({ ...legacy, name: legacy.name.trim() || profile.name })) {
      try { localStorage.setItem(migrationKey, 'done'); } catch { /* The server has already saved the preferences. */ }
      setLegacy(null);
    }
  }
  return <Context.Provider value={{ profile, update, clear: () => update({ ...emptyProfile, name: profile.name }), storageError, saving, legacy, importLegacy }}>{children}</Context.Provider>;
}
export function useProfile() { const value = useContext(Context); if (!value) throw new Error('ProfileProvider is missing'); return value; }
