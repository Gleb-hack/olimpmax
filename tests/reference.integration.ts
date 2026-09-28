import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../apps/api/src/db/client.js';
import { buildApp } from '../apps/api/src/app.js';
import { importCsv } from '../apps/api/src/import/importer.js';
import { applyReference, ReferenceValidationError } from '../apps/api/src/reference/apply.js';
import { buildReference, readReferenceDir, referenceFiles, type ReferenceInput } from '../apps/api/src/reference/load.js';
import * as contracts from '../packages/contracts/src/index.js';

if (!process.env.DATABASE_URL) throw new Error('Для интеграционных тестов нужен DATABASE_URL');
const admin = connectDatabase(process.env.DATABASE_URL);
const databaseName = `olimp_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = '/' + databaseName;
const connection = connectDatabase(testUrl.toString());
const today = '2026-09-27';
const source = readFileSync(new URL('../olimpiady.csv', import.meta.url));
const additions = { buffer: readFileSync(new URL(`../data/reference/${referenceFiles.additions}`, import.meta.url)), sourceFile: 'catalog-additions.csv' };
const input = readReferenceDir();
const reference = buildReference(input, { today });
let app: Awaited<ReturnType<typeof buildApp>>;
const get = async <T>(schema: { parse(value: unknown): T }, url: string) => {
  const response = await app.inject(url);
  assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
  return schema.parse(response.json());
};

before(async () => {
  await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
  const { readdir } = await import('node:fs/promises');
  const folder = new URL('../apps/api/drizzle/', import.meta.url);
  for (const filename of (await readdir(folder)).filter(f => f.endsWith('.sql')).sort()) {
    await connection.pool.query(readFileSync(new URL(filename, folder), 'utf8'));
  }
  const report = await importCsv(connection.db, source, 'olimpiady.csv', { replaceCatalog: true, additions, reference });
  assert.equal(report.inserted, 698);
  assert.equal(report.additions, 58);
  app = await buildApp({ db: connection.db, jwtSecret: 'test'.repeat(16), now: () => new Date(`${today}T10:00:00Z`) });
});
after(async () => {
  await app?.close(); await connection.pool.end();
  try { await admin.pool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); } finally { await admin.pool.end(); }
});

test('series data reaches every subject card: level by profile, schedule and benefits', async () => {
  const history = await get(contracts.OlympiadDetail, '/olympiads/5285');
  assert.equal(history.series?.slug, 'ranepa');
  assert.equal(history.level, 'II'); // перечень: история — II, хотя общий уровень РАНХиГС в olympiads_clean — III
  assert.equal(history.levelSource, 'rsosh_list');
  assert.equal(history.scheduleSource, 'reference');
  assert.match(history.calendarRaw!, /Заключительный этап: 30 января — 11 февраля/);
  assert.match(history.catalogCalendarRaw!, /20 окт—18 ноя/);
  assert.ok(history.stages.some(s => s.origin === 'reference' && s.mode === 'online'));
  assert.equal(history.benefits!.applicable, true);
  assert.equal(history.benefits!.items.length, 48); // 7 from the first benefits file + 20 from the 2026 delivery + 21 from its part 2
  assert.equal(history.seriesInfo!.profiles.length, 7);
  const philology = await get(contracts.OlympiadDetail, '/olympiads/6962');
  assert.equal(philology.level, null);
  assert.match(philology.levelStatus!, /не входит в перечень/);
  assert.equal(philology.benefits!.applicable, false);
  assert.deepEqual(philology.benefits!.items, []);
  assert.match(philology.benefits!.note!, /не распространяются/);
  const nto = await get(contracts.OlympiadDetail, '/olympiads/5369');
  assert.equal(nto.level, 'II–III');
  // ВсОШ cards joined series with the 2026 delivery: БВИ without ЕГЭ confirmation.
  const vsoshHistory = await get(contracts.OlympiadDetail, '/olympiads/84');
  assert.equal(vsoshHistory.series?.slug, 'vsosh-history');
  assert.ok(vsoshHistory.benefits!.items.some(b => b.university.slug === 'mgimo' && b.kind === 'bvi' && b.minScore === null && /не нужно/.test(b.requirement ?? '')));
  const german = await get(contracts.OlympiadDetail, '/olympiads/98');
  assert.equal(german.series?.slug, 'vsosh-foreign-languages');
  assert.ok(german.benefits!.applicable);
});

test('placeholder, outdated and contradicting schedules fall back to olimpiada.ru', async () => {
  const lomonosov = await get(contracts.OlympiadDetail, '/olympiads/348');
  assert.equal(lomonosov.scheduleSource, 'catalog');
  assert.equal(lomonosov.seriesInfo!.scheduleQuality, 'placeholder');
  assert.equal(lomonosov.calendarRaw, lomonosov.catalogCalendarRaw);
  const zvezda = await get(contracts.OlympiadDetail, '/olympiads/5663');
  assert.equal(zvezda.seriesInfo!.scheduleQuality, 'outdated');
  assert.equal(zvezda.scheduleSource, 'catalog');
  const math = await get(contracts.OlympiadDetail, '/olympiads/315');
  const chemistry = await get(contracts.OlympiadDetail, '/olympiads/317');
  assert.equal(math.scheduleSource, 'catalog'); // dates of the math olympiad differ from the series schedule
  assert.equal(chemistry.scheduleSource, 'reference');
  // Reference dates never become reminders.
  const events = contracts.CatalogResponse.parse((await app.inject('/olympiads?series=ranepa')).json());
  assert.ok(events.items.every(item => item.nextEvent === null));
});

test('catalog filters by university, series and the new level ranges', async () => {
  const mipt = await get(contracts.CatalogResponse, '/olympiads?universities=mipt&pageSize=100');
  assert.ok(mipt.total > 100);
  assert.ok(mipt.items.every(item => item.level !== null));
  assert.equal((await get(contracts.CatalogResponse, '/olympiads?series=spbu')).total, 23);
  assert.deepEqual((await get(contracts.CatalogResponse, '/olympiads?levels=II–III')).items.map(i => i.id), [5369]);
  const filters = await get(contracts.FiltersResponse, '/olympiads/filters');
  assert.equal(filters.universities!.length, 38);
  assert.equal(filters.levels!.find(l => l.value === 'II–III')!.count, 1);
  assert.equal((await app.inject('/olympiads?universities=Bad%20Slug')).statusCode, 400);
});

test('university and series endpoints', async () => {
  const list = await get(contracts.UniversityListResponse, '/universities');
  assert.equal(list.items.length, 38);
  const bmstu = await get(contracts.UniversityResponse, '/universities/bmstu');
  assert.deepEqual(bmstu.benefits.filter(b => b.series.slug === 'innopolis-open').map(b => b.kind).sort(), ['bvi', 'score_100']);
  const mipt = await get(contracts.UniversityResponse, '/universities/mipt');
  const innopolis = mipt.benefits.find(b => b.series.slug === 'innopolis-open')!;
  assert.deepEqual([innopolis.kind, innopolis.diploma, innopolis.minScore, innopolis.maxScore], ['bvi', 'winner', 75, 85]);
  assert.deepEqual(innopolis.olympiadIds, [5283, 5284, 5367, 5698, 5770]);
  // The page lists the cards by title and shows «О вузе» from data/reference/university-profiles.csv.
  assert.deepEqual(innopolis.olympiads!.map(o => o.id).sort(), [5283, 5284, 5367, 5698, 5770]);
  assert.match(innopolis.olympiads![0]!.title, /Innopolis Open по информатике/);
  assert.equal(mipt.type, 'state'); assert.equal(mipt.site, 'https://mipt.ru/'); assert.ok(mipt.description);
  assert.equal(mipt.rules, 'https://pk.mipt.ru/bachelor/2026_rules/');
  const tpu = await get(contracts.UniversityResponse, '/universities/tpu');
  assert.equal(tpu.city, 'Томск'); assert.ok(tpu.rules?.endsWith('.pdf')); assert.ok(tpu.benefits.length > 0);
  assert.ok(mipt.benefits.find(b => b.series.slug === 'phystech')?.organizers?.some(o => /физико-технический/i.test(o)));
  const series = await get(contracts.SeriesResponse, '/series/ranepa');
  assert.equal(series.olympiads.length, 8);
  assert.equal(series.stages.length, 3);
  assert.equal((await app.inject('/series/unknown')).statusCode, 404);
  assert.equal((await app.inject('/universities/unknown')).statusCode, 404);
});

test('re-import is idempotent, keeps stage ids, and a reviewed series switches to its own schedule', async () => {
  const stageIds = async () => (await connection.pool.query<{ id: string }>('select id from series_stages order by id')).rows.map(r => r.id);
  const before = await stageIds();
  const patched: ReferenceInput = { ...input, files: { ...input.files,
    [referenceFiles.series]: Buffer.from(input.files[referenceFiles.series]!.toString('utf8').replace(/^(lomonosov;[^\n]*?);;([^;\n]*)$/m, '$1;ok;$2')) } };
  const report = await applyReference(connection.db, buildReference(patched, { today }));
  assert.equal(report.series, 95);
  assert.deepEqual(await stageIds(), before);
  const lomonosov = await get(contracts.OlympiadDetail, '/olympiads/348');
  assert.equal(lomonosov.scheduleSource, 'reference');
  await applyReference(connection.db, reference);
  assert.equal((await get(contracts.OlympiadDetail, '/olympiads/348')).scheduleSource, 'catalog');
});

test('invalid reference data aborts the whole import', async () => {
  const broken: ReferenceInput = { ...input, files: { ...input.files,
    [referenceFiles.links]: Buffer.from(input.files[referenceFiles.links]!.toString('utf8') + '5285;no-such-series;;;\n') } };
  const bundle = buildReference(broken, { today });
  const level = async () => (await connection.pool.query<{ level: string | null }>('select level from olympiads where id = 5285')).rows[0]!.level;
  const levelBefore = await level();
  await assert.rejects(importCsv(connection.db, source, 'olimpiady.csv', { additions, reference: bundle }), ReferenceValidationError);
  await assert.rejects(applyReference(connection.db, bundle), ReferenceValidationError);
  assert.equal(await level(), levelBefore);
});
