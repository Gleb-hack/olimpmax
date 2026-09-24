import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProfilePreferences, UserProfile } from '@olimp/contracts';
import { api, canUseLocalAuth, clearSession, isMock, ApiError } from './api';
import { max } from './max';
import { useUI } from './ui-store';

const resumeKey = 'olimp.session.resume.v1';
const readResume = () => { try { return sessionStorage.getItem(resumeKey); } catch { return null; } };
const remember = (value: string) => { try { sessionStorage.setItem(resumeKey, value); } catch { /* Session still works in memory. */ } };
type Session = {
  user: UserProfile | null; starting: boolean; error: string | null;
  login: () => Promise<void>; register: (profile: ProfilePreferences) => Promise<void>;
  logout: () => void; setUser: (user: UserProfile) => void;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const client = useQueryClient();
  useEffect(() => {
    let active = true;
    const shouldResume = readResume() !== 'signed-out' && (max.isEmbedded || ((isMock || canUseLocalAuth) && readResume() === 'signed-in'));
    if (!shouldResume) { setStarting(false); return; }
    api.startSession().then(profile => { if (active && profile.registeredAt) setUser(profile); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Не удалось восстановить вход.'); })
      .finally(() => { if (active) setStarting(false); });
    return () => { active = false; };
  }, []);
  function logout() {
    version.current++; clearSession(); remember('signed-out'); setUser(null);
    void client.cancelQueries(); client.clear(); useUI.getState().clearComparison();
  }
  useEffect(() => {
    const expired = () => { logout(); setError('Сессия завершилась. Откройте мини-приложение в MAX заново.'); };
    window.addEventListener('olimp:session-expired', expired);
    return () => window.removeEventListener('olimp:session-expired', expired);
  });
  function enter(profile: UserProfile) { client.clear(); setError(null); setUser(profile); remember('signed-in'); }
  async function login() {
    const attempt = version.current;
    const profile = await api.startSession();
    if (!profile.registeredAt) throw new ApiError('Профиль ещё не создан. Перейдите на вкладку «Регистрация».', 409);
    if (attempt === version.current) enter(profile);
  }
  async function register(preferences: ProfilePreferences) {
    const attempt = version.current;
    const current = await api.startSession();
    if (current.registeredAt) throw new ApiError('Профиль уже существует. Перейдите на вкладку «Вход».', 409);
    const profile = await api.register(preferences);
    if (attempt === version.current) enter(profile);
  }
  const updateUser = (profile: UserProfile) => setUser(current => current?.id === profile.id ? profile : current);
  return <Context.Provider value={{ user, starting, error, login, register, logout, setUser: updateUser }}>{children}</Context.Provider>;
}
export function useSession() { const value = useContext(Context); if (!value) throw new Error('SessionProvider is missing'); return value; }
