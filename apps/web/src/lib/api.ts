import { z } from 'zod';
import * as c from '@olimp/contracts';
import { max } from './max';

export const isMock = import.meta.env.VITE_DATA_MODE === 'mock';
const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
let accessToken: string | null = null;
let expiresAt = 0;
let authPromise: Promise<string> | null = null;
let authGeneration = 0;
let sessionAllowed = false;
export const canUseLocalAuth = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH !== 'false' && !max.isEmbedded;
export function clearSession() {
  authGeneration++; sessionAllowed = false; accessToken = null; expiresAt = 0; authPromise = null;
}

async function send(path: string, options: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { ...options, signal: options.signal ?? AbortSignal.timeout(15000) }); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.', 0);
  }
  if (!response.ok) {
    const body = c.ErrorResponse.safeParse(await response.json().catch(() => null));
    throw new ApiError(body.success ? body.data.message : 'Не удалось загрузить данные. Попробуйте ещё раз.', response.status);
  }
  return response.status === 204 ? undefined : response.json();
}
async function authenticate() {
  if (!sessionAllowed) throw new ApiError('Войдите в аккаунт, чтобы продолжить.', 401);
  if (accessToken && Date.now() < expiresAt) return accessToken;
  if (authPromise) return authPromise;
  const generation = authGeneration;
  const pending = (async () => {
    const initData = max.initData;
    if (!initData && !(import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH !== 'false')) {
      throw new ApiError('Откройте Olimp в MAX, чтобы пользоваться чатом и личным планом.', 401);
    }
    try {
      const data = c.AuthResponse.parse(await send(initData ? '/auth/max' : '/auth/dev', {
        method: 'POST', ...(initData ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) } : {}),
      }));
      if (generation !== authGeneration) throw new ApiError('Вход отменён.', 401);
      accessToken = data.accessToken; expiresAt = Date.now() + (data.expiresIn - 30) * 1000;
      return data.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new ApiError('Сессия завершилась. Закройте и снова откройте мини-приложение в MAX.', 401);
      if (!initData && error instanceof ApiError && error.status === 404) throw new ApiError('Вход для разработки выключен. Откройте приложение в MAX или включите ALLOW_DEV_AUTH на локальном сервере.', 401);
      throw error;
    }
  })();
  authPromise = pending;
  try { return await pending; } finally { if (authPromise === pending) authPromise = null; }
}
async function request(path: string, options: RequestInit = {}, authenticated = false): Promise<unknown> {
  if (isMock) return (await import('./mock')).mockRequest(path, options);
  const generation = authGeneration;
  let token: string | null = null;
  try { token = authenticated ? await authenticate() : null; }
  catch (error) {
    if (authenticated && generation === authGeneration && error instanceof ApiError && error.status === 401) window.dispatchEvent(new Event('olimp:session-expired'));
    throw error;
  }
  if (authenticated && generation !== authGeneration) throw new ApiError('Запрос отменён после выхода из аккаунта.', 401);
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  try { return await send(path, { ...options, headers }); }
  catch (error) {
    if (authenticated && error instanceof ApiError && error.status === 401) {
      if (generation !== authGeneration) throw error;
      accessToken = null; expiresAt = 0;
      try {
        const renewedToken = await authenticate();
        return await send(path, { ...options, headers: { ...headers, Authorization: `Bearer ${renewedToken}` } });
      } catch (cause) {
        if (generation === authGeneration && cause instanceof ApiError && cause.status === 401) window.dispatchEvent(new Event('olimp:session-expired'));
        throw cause;
      }
    }
    throw error;
  }
}

export type Olympiad = z.infer<typeof c.OlympiadCard>;
export type PlanEntry = z.infer<typeof c.PlanItem>;
export type PlanPatch = z.infer<typeof c.PlanPatch>;
export const api = {
  async startSession() { sessionAllowed = true; return c.UserProfile.parse(await request('/me', {}, true)); },
  async register(profile: c.ProfilePreferences) { return c.UserProfile.parse(await request('/me/registration', { method: 'POST', body: JSON.stringify(c.ProfilePreferences.parse(profile)) }, true)); },
  async profile(patch: c.ProfilePatch) { return c.UserProfile.parse(await request('/me/profile', { method: 'PATCH', body: JSON.stringify(c.ProfilePatch.parse(patch)) }, true)); },
  async research(token: string, signal: AbortSignal) {
    if (isMock) throw new ApiError('Поиск на сайтах доступен при подключении к серверу.', 503);
    return c.AssistantResponse.parse(await request('/assistant/web-search', {
      method: 'POST', body: JSON.stringify(c.AssistantWebRequest.parse({ token })), signal,
    }, true));
  },
  async chat(input: c.AssistantRequest, signal: AbortSignal) {
    if (isMock) throw new ApiError('Чат с Олимпом доступен при подключении к серверу. В деморежиме ИИ не подключён.', 503);
    return c.AssistantResponse.parse(await request('/assistant/chat', {
      method: 'POST', body: JSON.stringify(c.AssistantRequest.parse(input)), signal,
    }, true));
  },
  async catalog(query: string, signal?: AbortSignal) { return c.CatalogResponse.parse(await request(`/olympiads?${query}`, { signal })); },
  async filters() { return c.FiltersResponse.parse(await request('/olympiads/filters')); },
  async detail(id: number) { return c.OlympiadDetail.parse(await request(`/olympiads/${id}`)); },
  async plan() { return c.PlanResponse.parse(await request('/me/plan', {}, true)); },
  async events() { return c.PlanEventsResponse.parse(await request('/me/plan/events?days=90', {}, true)); },
  async save(id: number) { await request(`/me/plan/${id}`, { method: 'PUT' }, true); },
  async remove(id: number) { await request(`/me/plan/${id}`, { method: 'DELETE' }, true); },
  async patch(id: number, patch: PlanPatch) { await request(`/me/plan/${id}`, { method: 'PATCH', body: JSON.stringify(c.PlanPatch.parse(patch)) }, true); },
};
