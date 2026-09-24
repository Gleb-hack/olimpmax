import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';

// Bundle the actual browser API client with a fixed test environment; no browser or real account is used.
const bundled = await build({ entryPoints: ['apps/web/src/lib/api.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({ DEV: true, VITE_DATA_MODE: 'api' }) } });
const code = Buffer.from(bundled.outputFiles![0]!.contents).toString('base64');
const user = { id: '00000000-0000-4000-8000-000000000001', maxUserId: '123', name: 'Тест', grade: 10,
  region: '', subjects: [], online: true, onsite: true, registeredAt: '2026-09-24T09:00:00Z', createdAt: '2026-09-24T09:00:00Z' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const auth = (accessToken: string) => json({ accessToken, expiresIn: 3600, user });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

test('late authentication after logout cannot reactivate a session or sign out a new session', async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = globalThis.fetch;
  const windowStub = Object.assign(new EventTarget(), { WebApp: { initData: 'test-only-start-data' } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
  t.after(() => { globalThis.fetch = previousFetch; if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  const oldAuth = deferred<Response>(); let authCalls = 0, expiryEvents = 0;
  windowStub.addEventListener('olimp:session-expired', () => { expiryEvents++; });
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/max')) return ++authCalls === 1 ? oldAuth.promise : auth('new-session');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer new-session');
    return String(url).endsWith('/me') ? json(user) : json({ items: [], total: 0 });
  };
  const { api, clearSession } = await import(`data:text/javascript;base64,${code}#${randomUUID()}`);
  const previous = api.startSession(); const rejected = assert.rejects(previous);
  clearSession();
  assert.equal((await api.startSession()).id, user.id);
  oldAuth.resolve(auth('stale-session')); await rejected;
  assert.equal(expiryEvents, 0); assert.equal((await api.plan()).total, 0); assert.equal(authCalls, 2);
});

test('an old unauthorized request cannot retry with credentials from the next login', async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = globalThis.fetch;
  const windowStub = Object.assign(new EventTarget(), { WebApp: { initData: 'test-only-start-data' } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
  t.after(() => { globalThis.fetch = previousFetch; if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  const oldPlan = deferred<Response>(), entered = deferred<void>(); let authCalls = 0, planCalls = 0, expiryEvents = 0;
  windowStub.addEventListener('olimp:session-expired', () => { expiryEvents++; });
  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/max')) return auth(`session-${++authCalls}`);
    if (String(url).endsWith('/me')) return json(user);
    planCalls++; if (planCalls === 1) { entered.resolve(); return oldPlan.promise; }
    return json({ items: [], total: 0 });
  };
  const { api, clearSession } = await import(`data:text/javascript;base64,${code}#${randomUUID()}`);
  await api.startSession(); const pending = api.plan(); const rejected = assert.rejects(pending);
  await entered.promise; clearSession(); await api.startSession();
  oldPlan.resolve(json({ error: 'UNAUTHORIZED', message: 'Expired' }, 401)); await rejected;
  assert.equal(planCalls, 1); assert.equal(expiryEvents, 0); assert.equal(authCalls, 2);
  assert.equal((await api.plan()).total, 0);
  clearSession(); await assert.rejects(api.plan()); assert.equal(planCalls, 2);
});
