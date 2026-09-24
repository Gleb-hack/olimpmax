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
import { databaseAssistantData } from '../apps/api/src/features/assistant/assistant.js';

// Each run owns a new database. Neither the working catalog nor a user's plan is deleted.
if (!process.env.DATABASE_URL) throw new Error('Для интеграционных тестов нужен DATABASE_URL');
const admin = connectDatabase(process.env.DATABASE_URL);
const databaseName = `olimp_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = '/' + databaseName;
const connection = connectDatabase(testUrl.toString());
let app: Awaited<ReturnType<typeof buildApp>>;
const now = new Date('2026-09-22T10:00:00Z');
const source = readFileSync(new URL('../olimpiady.csv', import.meta.url));
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
  assert.equal(first.inserted, 771);
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
test('catalog pagination, counts, combined filters, Russian search and detail contract', async () => {
  const response = await app.inject('/olympiads');
  assert.equal(response.statusCode, 200, response.body);
  const catalog = contracts.CatalogResponse.parse(response.json());
  assert.equal(catalog.total, 771); assert.equal(catalog.items.length, 20);
  assert(catalog.items.every(item => item.nextEvent === null));
  const filters = contracts.FiltersResponse.parse((await app.inject('/olympiads/filters')).json());
  assert.equal(filters.subjects.length, 35);
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
  assert(detailed.stages.every(s => s.beginsOn === null && s.endsOn === null));
  assert.equal((await app.inject('/olympiads/2147483647')).statusCode, 404);
  assert.equal((await app.inject('/olympiads?grades=12')).statusCode, 400);
  assert.equal((await app.inject('/olympiads?pageSize=100000')).statusCode, 400);
  assert.equal((await app.inject('/olympiads?q=' + encodeURIComponent("'; DROP TABLE olympiads; --"))).statusCode, 200);
  const second = contracts.CatalogResponse.parse((await app.inject('/olympiads?page=2')).json());
  assert(second.items.every(s => !catalog.items.some(first => first.id === s.id)));
});
test('personal plans require verified identity, are isolated and idempotent', async () => {
  assert.equal((await app.inject('/me/plan')).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/dev' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/max', payload: { initData: 'user=111&hash=abc' } })).statusCode, 401);
  for (let i = 0; i < 2; i++) assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/88', headers: auth(tokenA) })).statusCode, 204);
  let plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenA) })).json());
  assert.equal(plan.total, 1);
  assert.equal((await app.inject({ url: '/me/plan', headers: auth(tokenB) })).json().total, 0);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenB), payload: { note: 'чужая' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { note: 'Мой план' } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: auth(tokenA), payload: { userId: tokenB } })).statusCode, 400);
  const secondImport = await importCsv(connection.db, source, 'repeat.csv');
  assert.equal(secondImport.inserted, 0); assert.equal(secondImport.updated, 771);
  plan = contracts.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: auth(tokenA) })).json());
  assert.equal(plan.total, 1); assert.equal(plan.items[0]!.note, 'Мой план');
  const counts = await connection.pool.query('select (select count(*) from olympiads) as olympiads, (select count(*) from olympiad_stages) as stages');
  assert.equal(Number(counts.rows[0].olympiads), 771);
  assert.equal(Number(counts.rows[0].stages), rows.reduce((n, row) => n + row.stages.length, 0));
});
test('verified stage events, tracking switch, re-import preservation and invalidation', async () => {
  const verified = [{ olympiadId: 88, key: 'test-season-school', name: 'Проверка тестового события', kind: 'competition',
    beginsOn: '2026-09-20', endsOn: '2026-09-25', sourceUrl: 'https://example.org/test-only', verifiedAt: now.toISOString(), verifiedBy: 'Integration test' }];
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
    sourceUrl: 'https://example.org/test-only', verifiedAt: now.toISOString(), verifiedBy: 'Integration test' };
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
    beginsOn: '2026-09-23', endsOn: '2026-10-10', sourceUrl: 'https://example.org/test-only', verifiedAt: now.toISOString(), verifiedBy: 'Integration test' }], now);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ subjectIds: [8], grades: [9] })), [4357]);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ subjectIds: [18] })), []);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ grades: [4] })), []);
  assert.deepEqual(await reader.deadlineIds(contracts.CatalogQuery.parse({ formats: ['online'] })), []);
});

test('web research needs the matching authenticated user and explicit proposal token', async t => {
  let reads = 0, searches = 0;
  const chatApp = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16), now: () => now,
    assistantCompletion: async (_system, input) => {
      if ('providedSubjects' in (input as object)) return { intent: 'detail', olympiadIds: [4357] };
      if ('evidence' in (input as object)) return { message: 'Стоимость в базе не указана.', olympiadIds: [4357], needsWebSearch: true };
      if ('candidates' in (input as object)) return { indexes: [0] };
      return { message: 'На проверенной странице стоимость не указана [0].', found: false, sourceIndexes: [0] };
    }, searchWeb: async () => { searches++; return [{ url: 'https://organizer.ru/rules', title: 'Правила', snippet: 'Данные о стоимости отсутствуют.' }]; },
    readPublicPage: async url => { reads++; return { url, title: 'Олимпиада', text: 'Данные о стоимости отсутствуют.', links: [] }; },
  });
  t.after(() => chatApp.close());
  const offer = contracts.AssistantResponse.parse((await chatApp.inject({ method: 'POST', url: '/assistant/chat', headers: auth(tokenA), payload: { message: 'Сколько стоит участие?' } })).json()).webSearchOffer!;
  assert(offer); assert.equal(reads, 0); assert.equal(searches, 0);
  const payload = { token: offer.token };
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/web-search', payload })).statusCode, 401);
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/web-search', headers: auth(tokenB), payload })).statusCode, 400);
  assert.equal((await chatApp.inject({ method: 'POST', url: '/assistant/web-search', headers: auth(tokenA), payload: { token: 'yes', url: 'http://localhost' } })).statusCode, 400);
  assert.equal(reads, 0); assert.equal(searches, 0);
  const result = await chatApp.inject({ method: 'POST', url: '/assistant/web-search', headers: auth(tokenA), payload });
  assert.equal(result.statusCode, 200, result.body); assert.equal(reads, 1); assert.equal(searches, 1);
  const answer = contracts.AssistantResponse.parse(result.json());
  assert.equal(answer.webSources?.[0]?.url, 'https://organizer.ru/rules'); assert(answer.webDisclaimer);
});
