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
// Test account outside MAX: the password stays in the memory of this page; the issued token (one hour) is kept
// in sessionStorage of this tab only, so a reload or a direct link does not sign the reviewer out.
let testCredentials: c.TestAuthBody | null = null;
const testSessionKey = 'olimp.test-session.v1';
const TestSession = z.object({ token: z.string().min(1), expiresAt: z.number() });
function restoreTestSession() {
  if (max.isEmbedded) return false;
  try {
    const saved = TestSession.parse(JSON.parse(sessionStorage.getItem(testSessionKey) ?? 'null'));
    if (saved.expiresAt <= Date.now()) { sessionStorage.removeItem(testSessionKey); return false; }
    accessToken = saved.token; expiresAt = saved.expiresAt; return true;
  } catch { return false; }
}
/** A test-account session of this tab is still valid and can be resumed after a reload. */
export const hasTestSession = () => accessToken !== null && restoredTest;
let restoredTest = restoreTestSession();
export function clearSession() {
  authGeneration++; sessionAllowed = false; accessToken = null; expiresAt = 0; authPromise = null; testCredentials = null; restoredTest = false;
  try { sessionStorage.removeItem(testSessionKey); } catch { /* Nothing was kept. */ }
}
export function setTestAccount(credentials: c.TestAuthBody) { clearSession(); testCredentials = c.TestAuthBody.parse(credentials); }

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
    const credentials = initData ? null : testCredentials;
    if (!initData && !credentials && !(import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH !== 'false')) {
      throw new ApiError('Откройте Olimp в MAX, чтобы пользоваться чатом и личным планом.', 401);
    }
    try {
      const body = initData ? { initData } : credentials;
      const data = c.AuthResponse.parse(await send(initData ? '/auth/max' : credentials ? '/auth/test' : '/auth/dev', {
        method: 'POST', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      }));
      if (generation !== authGeneration) throw new ApiError('Вход отменён.', 401);
      accessToken = data.accessToken; expiresAt = Date.now() + (data.expiresIn - 30) * 1000;
      if (credentials) try { sessionStorage.setItem(testSessionKey, JSON.stringify({ token: accessToken, expiresAt })); } catch { /* Memory only. */ }
      return data.accessToken;
    } catch (error) {
      if (credentials && error instanceof ApiError && (error.status === 401 || error.status === 404)) {
        throw new ApiError(error.status === 404 ? 'Тестовый вход на этом сервере выключен.' : error.message, 401);
      }
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

/** An absolute link to an API path, e.g. the calendar feed a phone calendar subscribes to. */
export const apiUrl = (path: string) => new URL(`${baseUrl}${path}`, window.location.origin).href;

export type Olympiad = z.infer<typeof c.OlympiadCard>;
export type PlanEntry = z.infer<typeof c.PlanItem>;
export type PlanPatch = z.infer<typeof c.PlanPatch>;
export const api = {
  async authOptions() { return c.AuthOptions.parse(await request('/auth/options')); },
  async startSession() { sessionAllowed = true; return c.UserProfile.parse(await request('/me', {}, true)); },
  async currentProfile(signal?: AbortSignal) { return c.UserProfile.parse(await request('/me', { signal }, true)); },
  async register(profile: c.ProfilePreferences) { return c.UserProfile.parse(await request('/me/registration', { method: 'POST', body: JSON.stringify(c.ProfilePreferences.parse(profile)) }, true)); },
  async deleteAccount() { await request('/me', { method: 'DELETE' }, true); },
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
  async detail(id: number, goal = '') { return c.OlympiadDetail.parse(await request(`/olympiads/${id}${goal ? `?${goal}` : ''}`)); },
  /** Programs the olympiad helps to enter, narrowed to the goal (`universities`/`directions`; both given — their intersection). */
  async olympiadPrograms(id: number, goal: { universities: string[]; directions: string[] }, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (goal.universities.length) query.set('universities', goal.universities.join(','));
    if (goal.directions.length) query.set('directions', goal.directions.join(','));
    return c.OlympiadProgramsResponse.parse(await request(`/olympiads/${id}/programs?${query}`, { signal }));
  },
  async universities() { return c.UniversityListResponse.parse(await request('/universities')); },
  /** Universities with programs in one of these directions (the catalog's university search). */
  async universitiesFor(directions: string[], signal?: AbortSignal) {
    return c.UniversityListResponse.parse(await request(`/universities?${new URLSearchParams({ directions: directions.join(',') })}`, { signal }));
  },
  async directions() { return c.DirectionListResponse.parse(await request('/directions')); },
  async university(slug: string) { return c.UniversityResponse.parse(await request(`/universities/${encodeURIComponent(slug)}`)); },
  async plan() { return c.PlanResponse.parse(await request('/me/plan', {}, true)); },
  async notifications() { return c.NotificationSettings.parse(await request('/me/notifications', {}, true)); },
  async setNotifications(enabled: boolean) {
    return c.NotificationSettings.parse(await request('/me/notifications', { method: 'PATCH', body: JSON.stringify(c.NotificationSettingsPatch.parse({ enabled })) }, true));
  },
  async calendarFeed(reset = false) {
    return c.CalendarFeedResponse.parse(await request('/me/calendar-feed', { method: 'POST', body: JSON.stringify(c.CalendarFeedRequest.parse(reset ? { reset } : {})) }, true));
  },
  async events() { return c.PlanEventsResponse.parse(await request('/me/plan/events?days=90', {}, true)); },
  async save(id: number) { await request(`/me/plan/${id}`, { method: 'PUT' }, true); },
  async remove(id: number) { await request(`/me/plan/${id}`, { method: 'DELETE' }, true); },
  async patch(id: number, patch: PlanPatch) { await request(`/me/plan/${id}`, { method: 'PATCH', body: JSON.stringify(c.PlanPatch.parse(patch)) }, true); },
};
