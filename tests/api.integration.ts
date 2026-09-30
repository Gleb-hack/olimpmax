import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../apps/api/src/db/client.js';
import { buildApp } from '../apps/api/src/app.js';
import { importCsv } from '../apps/api/src/import/importer.js';
import { importVerifiedStages } from '../apps/api/src/import/verified-stages.js';
import { parseCsv } from '../apps/api/src/import/csv.js';
import { signedInitData, testBotToken } from './fixtures.js';
import * as contracts from '../packages/contracts/src/index.js';
import type { CompleteJson } from '../apps/api/src/features/assistant/deepseek.js';
import { answerAssistant, databaseAssistantData, evidenceFor } from '../apps/api/src/features/assistant/assistant.js';

// Each run owns a new database. Neither the working catalog nor a user's plan is deleted.
if (!process.env.DATABASE_URL) throw new Error('Для интеграционных тестов нужен DATABASE_URL');
const admin = connectDatabase(process.env.DATABASE_URL);
const databaseName = `olimp_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = '/' + databaseName;
const connection = connectDatabase(testUrl.toString());
let app: Awaited<ReturnType<typeof buildApp>>;
const now = new Date('2026-09-22T10:00:00Z');
const source = readFileSync(new URL('../data/catalog/olimpiady.csv', import.meta.url));
const rows = parseCsv(source);
let tokenA: string, tokenB: string;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

before(async () => {
  await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
  // Read real Drizzle SQL and apply it to a fresh PostgreSQL database.
  const { readdir } = await import('node:fs/promises');
  const folder = new URL('../apps/api/drizzle/', import.meta.url);
  for (const filename of (await readdir(folder)).filter(f => f.endsWith('.sql')).sort()) {
    await connection.pool.query(readFileSync(new URL(filename, folder), 'utf8'));
  }
  const first = await importCsv(connection.db, source, 'olimpiady.csv');
  assert.equal(first.inserted, 640);
  app = await buildApp({ db: connection.db, botToken: testBotToken, jwtSecret: 'test'.repeat(16), now: () => now });
  for (const id of [111, 222]) {
    const response = await app.inject({ method: 'POST', url: '/auth/max', payload: { initData: signedInitData(id, now) } });
    assert.equal(response.statusCode, 200, response.body);
    const token = contracts.AuthResponse.parse(response.json()).accessToken;
    if (id === 111) tokenA = token; else tokenB = token;
  }
});
after(async () => {
  await app?.close(); await connection.pool.end();
  try { await admin.pool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); } finally { await admin.pool.end(); }
});
test('test accounts sign in outside MAX only when configured and stay separate users', async t => {
  assert.equal((await app.inject({ method: 'POST', url: '/auth/test', payload: { login: 'student', password: 'checker-pass-1' } })).statusCode, 404);
  assert.deepEqual((await app.inject('/auth/options')).json(), { max: true, test: false });
  const testApp = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16), now: () => now,
    testAccounts: new Map([['student', 'checker-pass-1'], ['student2', 'checker-pass-2']]) });
  t.after(() => testApp.close());
  assert.deepEqual((await testApp.inject('/auth/options')).json(), { max: false, test: true });
  const wrong = await testApp.inject({ method: 'POST', url: '/auth/test', payload: { login: 'student', password: 'checker-pass-2' } });
  assert.equal(wrong.statusCode, 401); assert.equal(wrong.json().error, 'INVALID_CREDENTIALS');
  const signIn = async (login: string, password: string) => {
    const response = await testApp.inject({ method: 'POST', url: '/auth/test', payload: { login, password } });
    assert.equal(response.statusCode, 200, response.body);
    return contracts.AuthResponse.parse(response.json());
  };
  const first = await signIn('student', 'checker-pass-1');
  assert.equal(first.user.maxUserId, 'test:student');
  assert.equal((await signIn('Student', 'checker-pass-1')).user.id, first.user.id);
  const other = await signIn('student2', 'checker-pass-2');
  assert.notEqual(other.user.id, first.user.id);
  assert.equal((await testApp.inject({ method: 'PUT', url: '/me/plan/88', headers: auth(first.accessToken) })).statusCode, 204);
  assert.equal((await testApp.inject({ url: '/me/plan', headers: auth(other.accessToken) })).json().total, 0);
  assert.equal((await testApp.inject({ method: 'DELETE', url: '/me', headers: auth(first.accessToken) })).statusCode, 204);
  assert.equal((await testApp.inject({ method: 'DELETE', url: '/me', headers: auth(other.accessToken) })).statusCode, 204);
});
test('catalog filters every source level before pagination and rejects invalid levels', async () => {
  for (const level of contracts.OlympiadLevel.options) {
    const expected = rows.filter(row => (row.olympiad.rawSource['Уровень олимпиады'] === '—' ? 'unknown' : row.olympiad.rawSource['Уровень олимпиады']) === level);
    const response = await app.inject(`/olympiads?levels=${encodeURIComponent(level)}&pageSize=1&page=2`);
    assert.equal(response.statusCode, 200, response.body);
    const result = contracts.CatalogResponse.parse(response.json());
    assert.equal(result.total, expected.length);
    assert.equal(result.items.length, expected.length > 1 ? 1 : 0);
    assert.ok(result.items.every(item => (item.level ?? 'unknown') === level));
  }
  const result = contracts.CatalogResponse.parse((await app.inject('/olympiads?levels=I,II&formats=hybrid&grades=9&pageSize=100')).json());
  const expected = rows.filter(row => ['I', 'II'].includes(row.olympiad.rawSource['Уровень олимпиады']!) && row.olympiad.format === 'hybrid' && row.olympiad.gradeFrom !== null && row.olympiad.gradeFrom <= 9 && row.olympiad.gradeTo! >= 9);
  assert.equal(result.total, expected.length);
  assert.equal((await app.inject('/olympiads?levels=IV')).statusCode, 400);
});

test('catalog pagination, counts, combined filters, Russian search and detail contract', async () => {
  const response = await app.inject('/olympiads');
  assert.equal(response.statusCode, 200, response.body);
  const catalog = contracts.CatalogResponse.parse(response.json());
  assert.equal(catalog.total, 640); assert.equal(catalog.items.length, 20);
  assert(catalog.items.every(item => item.nextEvent === null));
  const filters = contracts.FiltersResponse.parse((await app.inject('/olympiads/filters')).json());
  assert.equal(filters.subjects.length, 34);
  const math = filters.subjects.find(s => s.name === 'Математика')!;
  const expected = rows.filter(r => r.subjectNames.includes('Математика') && r.olympiad.gradeFrom !== null && r.olympiad.gradeFrom <= 9 && r.olympiad.gradeTo! >= 9 && r.olympiad.format === 'hybrid');
  const filtered = contracts.CatalogResponse.parse((await app.inject(`/olympiads?subjectIds=${math.id}&grades=9&formats=hybrid&pageSize=100`)).json());
  assert.equal(filtered.total, expected.length);
  assert(filtered.items.every(item => item.subjects.some(s => s.id === math.id)));
  const searched = contracts.CatalogResponse.parse((await app.inject('/olympiads?q=' + encodeURIComponent('ВЫСШАЯ ПРОБА'))).json());
  assert(searched.total > 0);
  const detailed = contracts.OlympiadDetail.parse((await app.inject('/olympiads/88')).json());
  assert.equal(detailed.rawSource['Описание'], rows.find(r => r.olympiad.id === 88)!.olympiad.rawSource['Описание']);
  assert.equal(detailed.calendarState, 'unverified');
  assert.equal(detailed.level, 'ВсОШ');
  const enriched = contracts.OlympiadDetail.parse((await app.inject('/olympiads/5758')).json());
  assert.equal(enriched.level, 'III');
  assert.match(enriched.levelStatus!, /Проект РСОШ/);
  assert.equal(enriched.stages.find(stage => stage.kind === 'registration')?.rawDates, 'До 30 ноя');
  const card = contracts.CatalogResponse.parse((await app.inject('/olympiads?q=' + encodeURIComponent('Миссия выполнима'))).json()).items.find(item => item.id === 5758)!;
  assert.equal(card.calendarRaw, enriched.calendarRaw);
  assert.equal(card.level, 'III');
  assert(detailed.stages.every(s => s.beginsOn === null && s.endsOn === null));
  assert.equal((await app.inject('/olympiads/2147483647')).statusCode, 404);
  assert.equal((await app.inject('/olympiads?grades=12')).statusCode, 400);
  assert.equal((await app.inject('/olympiads?pageSize=100000')).statusCode, 400);
  assert.equal((await app.inject('/olympiads?q=' + encodeURIComponent("'; DROP TABLE olympiads; --"))).statusCode, 200);
  const second = contracts.CatalogResponse.parse((await app.inject('/olympiads?page=2')).json());
  assert(second.items.every(s => !catalog.items.some(first => first.id === s.id)));
});

test('replacing a catalog hides missing entries but preserves saved plans and allows reactivation', async () => {
  const original = rows.find(row => row.olympiad.id === 88)!;
  const fake = { ...original.olympiad, id: 2000000000, title: 'Тестовая архивная олимпиада', sourceUrl: 'https://olimpiada.ru/activity/2000000000' };
  const { olympiads } = await import('../apps/api/src/db/schema.js');
  await connection.db.insert(olympiads).values(fake);
  await app.inject({ method: 'PUT', url: '/me/plan/2000000000', headers: auth(tokenB) });
  await app.inject({ method: 'PATCH', url: '/me/plan/2000000000', headers: auth(tokenB), payload: { note: 'Сохранить после обновления', tracking: false } });
  const partial = await importCsv(connection.db, source, 'partial.csv');
  assert.equal(partial.hiddenFromCatalog, 0);
  assert.equal((await app.inject('/olympiads')).json().total, 641);
  const replacement = await importCsv(connection.db, source, 'complete.csv', { replaceCatalog: true });
  assert.equal(replacement.hiddenFromCatalog, 1);
  assert.equal((await app.inject('/olympiads')).json().total, 640);
  assert.equal((await app.inject('/olympiads?q=' + encodeURIComponent('Тестовая архивная'))).json().total, 0);
  const filters = contracts.FiltersResponse.parse((await app.inject('/olympiads/filters')).json());
  assert.equal(filters.formats.reduce((sum, item) => sum + item.count, 0), 640);
  const plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenB) })).json());
  assert.equal(plan.items[0]!.olympiad.id, fake.id);
  assert.equal(plan.items[0]!.tracking, false);
  assert.equal(plan.items[0]!.note, 'Сохранить после обновления');
  assert.equal((await app.inject('/olympiads/2000000000')).statusCode, 200);
  await connection.pool.query('update olympiads set in_catalog = false where id = 88');
  await importCsv(connection.db, source, 'repeat.csv', { replaceCatalog: true });
  assert.equal((await app.inject('/olympiads')).json().total, 640);
  await app.inject({ method: 'DELETE', url: '/me/plan/2000000000', headers: auth(tokenB) });
  await connection.pool.query('delete from olympiads where id = 2000000000');
});
test('personal plans require verified identity, are isolated and idempotent', async () => {
  assert.equal((await app.inject('/me/plan')).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/dev' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/max', payload: { initData: 'user=111&hash=abc' } })).statusCode, 401);
  for (let i = 0; i < 2; i++) assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/88', headers: auth(tokenA) })).statusCode, 204);
  let plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenA) })).json());
  assert.equal(plan.total, 1);
  // The plan calendar gets the card's stages; the year comes from the 2026/27 season of the checked schedule.
  assert.deepEqual(plan.items[0]!.calendarEvents!.map(e => [e.name, e.kind, e.date, e.estimated]), [
    ['Школьный этап', 'ends', '2026-11-01', true], ['Муниципальный этап', 'starts', '2026-11-02', true], ['Муниципальный этап', 'ends', '2026-12-25', true]]);
  assert.equal((await app.inject({ url: '/me/plan', headers: auth(tokenB) })).json().total, 0);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenB), payload: { note: 'чужая' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { note: 'Мой план' } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { userId: tokenB } })).statusCode, 400);
  const secondImport = await importCsv(connection.db, source, 'repeat.csv');
  assert.equal(secondImport.inserted, 0); assert.equal(secondImport.updated, 640);
  plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenA) })).json());
  assert.equal(plan.total, 1); assert.equal(plan.items[0]!.note, 'Мой план');
  const counts = await connection.pool.query('select (select count(*) from olympiads) as olympiads, (select count(*) from olympiad_stages) as stages');
  assert.equal(Number(counts.rows[0].olympiads), 640);
  assert.equal(Number(counts.rows[0].stages), rows.reduce((n, row) => n + row.stages.length, 0));
});
test('verified stage events, tracking switch, re-import preservation and invalidation', async () => {
  const verified = [{ olympiadId: 88, key: 'test-season-school', name: 'Проверка тестового события', kind: 'competition',
    beginsOn: '2026-09-20', endsOn: '2026-09-25', sourceUrl: 'https://example.org/test-only', verifiedAt: now.toISOString() }];
  await importVerifiedStages(connection.db, verified, now);
  await importVerifiedStages(connection.db, verified, now);
  let events = contracts.PlanEventsResponse.parse((await app.inject({ url: '/me/plan/events?days=10', headers: auth(tokenA) })).json());
  assert.equal(events.items.length, 1); assert.equal(events.items[0]!.kind, 'ends');
  assert.equal(events.items[0]!.date, '2026-09-25');
  const sameImport = await importCsv(connection.db, source, 'unchanged.csv');
  assert.equal(sameImport.invalidatedStages, 0);
  await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { tracking: false } });
  assert.equal((await app.inject({ url: '/me/plan/events', headers: auth(tokenA) })).json().items.length, 0);
  await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { tracking: true } });
  const changed = Buffer.from(source.toString().replace('До 1 ноя', 'До 2 ноя'));
  const changedImport = await importCsv(connection.db, changed, 'changed-calendar.csv');
  assert.equal(changedImport.invalidatedStages, 1);
  assert.equal((await app.inject({ url: '/me/plan/events', headers: auth(tokenA) })).json().items.length, 0);
  const card = (await app.inject('/olympiads/88')).json();
  assert.equal(card.calendarState, 'needs_review');
  assert.equal(card.nextEvent, null);
  assert.equal((await app.inject({ method: 'DELETE', url: '/me/plan/88', headers: auth(tokenB) })).statusCode, 204);
  assert.equal((await app.inject({ url: '/me/plan', headers: auth(tokenA) })).json().total, 1);
  assert.equal((await app.inject({ method: 'DELETE', url: '/me/plan/88', headers: auth(tokenA) })).statusCode, 204);
  assert.equal((await app.inject({ url: '/me/plan', headers: auth(tokenA) })).json().total, 0);
});
test('invalid verified batch rolls back, unknown IDs cannot be saved, database constraints hold', async () => {
  const valid = { olympiadId: 88, key: 'rollback-test', name: 'Тест', kind: 'competition', beginsOn: '2026-09-23', endsOn: null,
    sourceUrl: 'https://example.org/test-only', verifiedAt: now.toISOString() };
  await assert.rejects(importVerifiedStages(connection.db, [valid, { ...valid, olympiadId: 2147483647 }], now), /не найдена/);
  const check = await connection.pool.query("select count(*) from olympiad_stages where source_key = 'rollback-test'");
  assert.equal(Number(check.rows[0].count), 0);
  assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/2147483647', headers: auth(tokenA) })).statusCode, 404);
  await assert.rejects(connection.pool.query('update olympiads set grade_from = 12 where id = 88'), /check constraint/);
  const health = await app.inject('/health'); assert.equal(health.statusCode, 200);
});

test('assistant enforces auth and body contracts before contacting the provider', async t => {
  let calls = 0;
  const chatApp = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16),
    assistantCompletion: async () => { calls++; return { intent: 'off_topic' }; } });
  t.after(() => chatApp.close());
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/chat', payload: { message: 'Привет' } })).statusCode, 401);
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/chat', headers: auth(tokenA), payload: { message: 'Привет', userId: tokenB } })).statusCode, 400);
  assert.equal(calls, 0);
  const result = await chatApp.inject({ method: 'POST', url: '/assistant/chat', headers: auth(tokenA), payload: { message: 'Рецепт' } });
  assert.equal(result.statusCode, 200); assert.equal(result.headers['cache-control'], 'no-store');
  assert.match(contracts.AssistantResponse.parse(result.json()).message, /только с олимпиадами/);
});

test('assistant reads only the authenticated plan and omits private notes', async t => {
  await app.inject({ method: 'PUT', url: '/me/plan/4357', headers: auth(tokenA) });
  await app.inject({ method: 'PATCH', url: '/me/plan/4357', headers: auth(tokenA), payload: { note: 'PRIVATE_TEST_NOTE' } });
  let evidenceIds: number[] = [];
  const completion: CompleteJson = async (_system, input) => {
    const value = input as { evidence?: { id: number }[] };
    assert.equal(JSON.stringify(input).includes('PRIVATE_TEST_NOTE'), false);
    if (!value.evidence) return { intent: 'plan' };
    evidenceIds = value.evidence.map(x => x.id);
    return { message: evidenceIds.length ? 'В вашем плане есть олимпиада.' : 'В плане пока пусто.', olympiadIds: evidenceIds };
  };
  const chatApp = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16), assistantCompletion: completion });
  t.after(async () => { await chatApp.close(); await app.inject({ method: 'DELETE', url: '/me/plan/4357', headers: auth(tokenA) }); });
  for (const [token, expected] of [[tokenA, [4357]], [tokenB, []]] as const) {
    evidenceIds = [];
    const response = await chatApp.inject({ method: 'POST', url: '/assistant/chat', headers: auth(token), payload: { message: 'Что в моём плане?' } });
    assert.equal(response.statusCode, 200, response.body); assert.deepEqual(evidenceIds, expected);
    assert.deepEqual(contracts.AssistantResponse.parse(response.json()).olympiads.map(item => item.id), expected);
  }
});

test('assistant prevents concurrent duplicate requests and limits paid calls per user', async t => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const chatApp = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16), assistantCompletion: async () => {
    calls++; entered(); if (calls === 1) await blocked; return { intent: 'off_topic' };
  } });
  t.after(() => chatApp.close());
  const query = { method: 'POST' as const, url: '/assistant/chat', headers: auth(tokenA), payload: { message: 'Рецепт' } };
  const first = chatApp.inject(query); void first.then(() => {});
  await started;
  try { assert.equal((await chatApp.inject(query)).statusCode, 429); } finally { release(); }
  assert.equal((await first).statusCode, 200);
  assert.equal(calls, 1);
  for (let i = 0; i < 8; i++) assert.equal((await chatApp.inject(query)).statusCode, 200);
  assert.equal((await chatApp.inject(query)).statusCode, 429);
  assert.equal(calls, 9);
});

test('assistant deadline lookup applies subject, grade and verified-date filters', async () => {
  const reader = databaseAssistantData(connection.db, '', '2026-09-23');
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({})), []);
  await importVerifiedStages(connection.db, [{ olympiadId: 4357, key: 'assistant-test-only', name: 'Регистрация', kind: 'registration',
    beginsOn: '2026-09-23', endsOn: '2026-10-10', sourceUrl: 'https://example.org/test-only', verifiedAt: now.toISOString() }], now);
  const filters = contracts.FiltersResponse.parse((await app.inject('/olympiads/filters')).json());
  const informaticsId = filters.subjects.find(subject => subject.name === 'Информатика')!.id;
  const chemistryId = filters.subjects.find(subject => subject.name === 'Химия')!.id;
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ subjectIds: [informaticsId], grades: [9] })), [4357]);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ subjectIds: [chemistryId] })), []);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ grades: [4] })), []);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ formats: ['online'] })), []);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ q: 'неизвестная олимпиада' })), []);
});

test('assistant reads reimported source dates live and keeps yearless dates separate from verified events', async () => {
  const profile = contracts.AuthResponse.parse((await app.inject({ method: 'POST', url: '/auth/max', payload: { initData: signedInitData(98765, now) } })).json()).user;
  const reader = databaseAssistantData(connection.db, profile.id, '2026-09-27');
  const original = rows.find(row => row.olympiad.id === 5031)!.olympiad;
  const calendar = 'Регистрация: До 15 окт\nЗаключительный этап: 2 ноя 2026';
  const raw = { ...original.rawSource, 'Календарь': calendar };
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const updatedCsv = Buffer.from([Object.keys(raw).map(quote).join(';'), Object.values(raw).map(quote).join(';')].join('\n'));
  await importCsv(connection.db, updatedCsv, 'assistant-updated-schedule.csv');
  const current = (await reader.detail(5031))!;
  assert.equal(current.calendarRaw, calendar);
  assert.equal(current.nextEvent, null);
  assert.deepEqual(evidenceFor(current).sourceStages.map(stage => stage.rawDates), ['До 15 окт', '2 ноя 2026']);
  assert.deepEqual(evidenceFor(current).verifiedStages, []);
  const query = contracts.CatalogQuery.parse({ q: 'Наше наследие', grades: [9], formats: ['onsite'] });
  assert.deepEqual(await reader.deadlineIds(query), []);
  assert.deepEqual(await reader.scheduleIds(query), [5031]);
  assert.deepEqual(await reader.scheduleIds({ ...query, formats: ['online'] }), []);
  let calls = 0;
  const answer = await answerAssistant(contracts.AssistantRequest.parse({ message: 'Какие ближайшие даты у Нашего наследия для 9 класса?' }), reader,
    async (_system, payload) => {
      if (++calls === 1) return { intent: 'deadlines', queries: ['Наше наследие'], grade: 9, format: 'onsite' };
      const evidence = (payload as { evidence: ReturnType<typeof evidenceFor>[] }).evidence;
      assert.equal(evidence[0]!.calendarText, calendar);
      return { message: 'По расписанию: регистрация — до 15 окт, заключительный этап — 2 ноя 2026. Год регистрации нужно уточнить.', olympiadIds: [5031] };
    }, '2026-09-27', AbortSignal.timeout(10000));
  assert.equal(calls, 2);
  assert.match(answer.message, /15 окт/);
  assert.equal(answer.olympiads[0]!.calendarRaw, calendar);
});

test('web research runs only on the server ticket of the matching user, without a consent step', async t => {
  let reads = 0;
  const chatApp = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16), now: () => now,
    assistantCompletion: async (_system, input) => {
      if ('providedSubjects' in (input as object)) return { intent: 'detail', olympiadIds: [4357] };
      if ('evidence' in (input as object)) return { message: 'Стоимость в базе не указана.', olympiadIds: [4357], needsWebSearch: true };
      if ('candidates' in (input as object)) {
        const candidates = (input as { candidates: { index: number; url: string }[] }).candidates;
        // The olympiad's own catalog page comes first, the curated links follow.
        assert.equal(candidates[0]!.url, 'https://olimpiada.ru/activity/4357');
        assert.ok(candidates.some(c => c.url === 'https://rsr-olymp.ru/'));
        return { indexes: [0] };
      }
      return { message: 'На странице олимпиады стоимость не указана [0].', found: false, sourceIndexes: [0] };
    },
    readPublicPage: async url => { reads++; return { url, title: 'Олимпиада', text: 'Данные о стоимости отсутствуют. '.repeat(4), links: [], kind: 'html' }; },
  });
  t.after(() => chatApp.close());
  const chat = contracts.AssistantResponse.parse((await chatApp.inject({ method: 'POST', url: '/assistant/chat', headers: auth(tokenA), payload: { message: 'Сколько стоит участие?' } })).json());
  assert.match(chat.message, /Сейчас поищу в интернете/);
  const ticket = chat.webSearch!;
  assert(ticket); assert.deepEqual(ticket.olympiadIds, [4357]); assert.equal(reads, 0);
  const payload = { token: ticket.token };
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/web-search', payload })).statusCode, 401);
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/web-search', headers: auth(tokenB), payload })).statusCode, 400);
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/web-search', headers: auth(tokenA), payload: { token: 'yes', url: 'http://localhost' } })).statusCode, 400);
  assert.equal(reads, 0);
  const result = await chatApp.inject({ method: 'POST', url: '/assistant/web-search', headers: auth(tokenA), payload });
  assert.equal(result.statusCode, 200, result.body); assert.equal(reads, 1);
  const answer = contracts.AssistantResponse.parse(result.json());
  assert.equal(answer.webSources?.[0]?.url, 'https://olimpiada.ru/activity/4357'); assert(answer.webDisclaimer);
});
test('plan status and stage results are saved together, validated and removed with the plan item', async () => {
  assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/88', headers: auth(tokenB) })).statusCode, 204);
  let plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenB) })).json());
  assert.equal(plan.items[0]!.status, 'planned'); assert.deepEqual(plan.items[0]!.results, []);
  const results = [{ stage: 'Отборочный этап', result: 'passed' }, { stage: 'Заключительный этап', result: 'prize' }];
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenB), payload: { status: 'in_progress', results } })).statusCode, 204);
  plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenB) })).json());
  assert.equal(plan.items[0]!.status, 'in_progress');
  assert.deepEqual(plan.items[0]!.results.map((r: { stage: string }) => r.stage).sort(), ['Заключительный этап', 'Отборочный этап']);
  // Only the owner's item; unknown statuses, duplicate stages and an empty stage name are rejected.
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { status: 'done' } })).statusCode, 404);
  for (const payload of [{ status: 'won' }, { results: [results[0], results[0]] }, { results: [{ stage: ' ', result: 'passed' }] }, { results: [{ stage: 'Финал', result: 'bronze' }] }]) {
    assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenB), payload })).statusCode, 400, JSON.stringify(payload));
  }
  // A status change alone keeps the results; results: [] removes them.
  await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenB), payload: { status: 'done' } });
  plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenB) })).json());
  assert.equal(plan.items[0]!.status, 'done'); assert.equal(plan.items[0]!.results.length, 2);
  await app.inject({ method: 'DELETE', url: '/me/plan/88', headers: auth(tokenB) });
  const left = await connection.pool.query('select count(*) from plan_stage_results');
  assert.equal(Number(left.rows[0].count), 0);
});
test('calendar feed: a secret link per user, the same until reset, readable without sign-in', async () => {
  assert.equal((await app.inject({ method: 'POST', url: '/me/calendar-feed', payload: {} })).statusCode, 401);
  const first = contracts.CalendarFeedResponse.parse((await app.inject({ method: 'POST', url: '/me/calendar-feed', headers: auth(tokenB), payload: {} })).json());
  const again = contracts.CalendarFeedResponse.parse((await app.inject({ method: 'POST', url: '/me/calendar-feed', headers: auth(tokenB), payload: {} })).json());
  assert.equal(again.path, first.path);
  const feed = await app.inject(first.path);
  assert.equal(feed.statusCode, 200, feed.body);
  assert.match(String(feed.headers['content-type']), /^text\/calendar/);
  assert.ok(feed.body.startsWith('BEGIN:VCALENDAR\r\n'));
  const other = contracts.CalendarFeedResponse.parse((await app.inject({ method: 'POST', url: '/me/calendar-feed', headers: auth(tokenA), payload: {} })).json());
  assert.notEqual(other.path, first.path);
  const reset = contracts.CalendarFeedResponse.parse((await app.inject({ method: 'POST', url: '/me/calendar-feed', headers: auth(tokenB), payload: { reset: true } })).json());
  assert.notEqual(reset.path, first.path);
  assert.equal((await app.inject(first.path)).statusCode, 404);
  assert.equal((await app.inject(reset.path)).statusCode, 200);
  assert.equal((await app.inject('/calendar/not-a-token.ics')).statusCode, 400);
});
test('universities can be narrowed to those with programs in a direction', async () => {
  const all = contracts.UniversityListResponse.parse((await app.inject('/universities')).json());
  const response = await app.inject('/universities?directions=09.03.04');
  assert.equal(response.statusCode, 200, response.body);
  const narrowed = contracts.UniversityListResponse.parse(response.json());
  assert.ok(narrowed.items.length <= all.items.length);
  assert.ok(narrowed.items.every(item => all.items.some(u => u.slug === item.slug)));
  assert.equal((await app.inject('/universities?directions=abc')).statusCode, 400);
});
