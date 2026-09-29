import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../apps/api/src/db/client.js';
import { buildApp } from '../apps/api/src/app.js';
import { importCsv } from '../apps/api/src/import/importer.js';
import { applyReference } from '../apps/api/src/reference/apply.js';
import { buildReference, readReferenceDir, referenceFiles } from '../apps/api/src/reference/load.js';
import { signedInitData, testBotToken } from './fixtures.js';
import * as c from '../packages/contracts/src/index.js';

if (!process.env.DATABASE_URL) throw new Error('Для интеграционных тестов нужен DATABASE_URL');
const admin = connectDatabase(process.env.DATABASE_URL);
const databaseName = `olimp_directions_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = '/' + databaseName;
const connection = connectDatabase(testUrl.toString());
const today = '2026-09-29';
const reference = buildReference(readReferenceDir(), { today });
let app: Awaited<ReturnType<typeof buildApp>>;
const get = async <T>(schema: { parse(value: unknown): T }, url: string) => {
  const response = await app.inject(url);
  assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
  return schema.parse(response.json());
};
const count = async (sql: string) => Number((await connection.pool.query(sql)).rows[0].count);

before(async () => {
  await admin.pool.query(`CREATE DATABASE "${databaseName}"`);
  const folder = new URL('../apps/api/drizzle/', import.meta.url);
  for (const file of readdirSync(folder).filter(f => f.endsWith('.sql')).sort()) await connection.pool.query(readFileSync(new URL(file, folder), 'utf8'));
  const report = await importCsv(connection.db, readFileSync(new URL('../data/catalog/olimpiady.csv', import.meta.url)), 'olimpiady.csv', {
    replaceCatalog: true, reference,
    additions: { buffer: readFileSync(new URL(`../data/reference/${referenceFiles.additions}`, import.meta.url)), sourceFile: 'catalog-additions.csv' },
  });
  assert.ok('directions' in report.reference);
  assert.equal(report.reference.directions, 294);
  assert.equal(report.reference.programs, 2401);
  app = await buildApp({ db: connection.db, jwtSecret: 'directions'.repeat(8), botToken: testBotToken, now: () => new Date(`${today}T10:00:00Z`) });
});
after(async () => {
  await app?.close(); await connection.pool.end();
  try { await admin.pool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); } finally { await admin.pool.end(); }
});

test('import links universities, directions, programs and olympiads', async () => {
  assert.equal(await count('select count(*) from directions'), 294);
  assert.equal(await count('select count(*) from university_programs'), 2401);
  assert.equal(await count('select count(distinct university_id) from university_programs'), 38);
  assert.ok(await count('select count(*) from direction_subjects') > 294);
  assert.ok(await count('select count(*) from olympiad_directions where via_rsosh') > 0);
  assert.ok(await count("select count(*) from olympiad_directions where subject_relevance = 'core'") > 0);
  // Every card linked by a core subject really has that subject.
  assert.equal(await count(`select count(*) from olympiad_directions od join direction_subjects ds on ds.direction_id = od.direction_id and ds.relevance = 'core'
    where od.subject_relevance = 'core' and not exists (select 1 from olympiad_subjects os join direction_subjects d2 on d2.subject_id = os.subject_id
      and d2.direction_id = od.direction_id and d2.relevance = 'core' where os.olympiad_id = od.olympiad_id)`), 0);
  const source = (await connection.pool.query("select status, url from reference_sources where key = 'programs'")).rows[0];
  assert.equal(source.url, 'https://tabiturient.ru');
});

test('directions: search by colloquial names, detail with universities, programs and olympiads', async () => {
  const search = await get(c.DirectionListResponse, '/directions?q=прога');
  assert.equal(search.items[0]?.code, '09.03.04');
  assert.equal((await get(c.DirectionListResponse, '/directions?q=09.03')).items.every(d => d.code.startsWith('09.03')), true);
  const popular = await get(c.DirectionListResponse, '/directions?popular=true');
  assert.ok(popular.items.length > 50 && popular.items.every(d => d.popular));
  const innopolis = await get(c.DirectionListResponse, '/directions?universities=innopolis');
  assert.deepEqual(innopolis.items.map(d => d.code), ['09.03.01', '15.03.06']);

  const se = await get(c.DirectionResponse, '/directions/09.03.04');
  assert.equal(se.name, 'Программная инженерия');
  assert.deepEqual(se.subjectsCore, ['Информатика', 'Математика']);
  assert.equal(se.universities.length, se.universityCount);
  assert.equal(se.universities.reduce((n, u) => n + u.programs.length, 0), se.programCount);
  const itmo = se.universities.find(u => u.slug === 'itmo')!;
  assert.ok(itmo.programs.length > 0);
  const scores = itmo.programs.map(p => p.passingScore ?? -1);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.ok(se.olympiads.total >= se.olympiads.items.length && se.olympiads.items.length > 0);
  assert.ok(se.olympiads.items.every(o => o.viaRsosh || o.subjectRelevance === 'core'));
  assert.equal((await app.inject('/directions/99.03.99')).statusCode, 404);
  assert.equal((await app.inject('/directions/09.04.01')).statusCode, 400);
  assert.equal((await app.inject('/directions?unknown=1')).statusCode, 400);
});

test('olympiads: filter by direction, directions on the card and programs it helps to enter', async () => {
  const all = await get(c.CatalogResponse, '/olympiads?pageSize=1');
  const filtered = await get(c.CatalogResponse, '/olympiads?directions=09.03.04&pageSize=100');
  assert.ok(filtered.total > 0 && filtered.total < all.total);
  const withUniversity = await get(c.CatalogResponse, '/olympiads?directions=09.03.04&universities=hse&pageSize=1');
  assert.ok(withUniversity.total > 0 && withUniversity.total <= filtered.total);

  const card = await get(c.OlympiadDetail, `/olympiads/${withUniversity.items[0]!.id}`);
  const se = card.directions!.find(d => d.code === '09.03.04');
  assert.ok(se && (se.viaRsosh || se.subjectRelevance === 'core'));
  const weights = card.directions!.map(d => (d.viaRsosh ? 4 : 0) + (d.subjectRelevance === 'core' ? 2 : d.subjectRelevance === 'related' ? 1 : 0));
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a));

  const programs = await get(c.OlympiadProgramsResponse, `/olympiads/${card.id}/programs?universities=hse&directions=09.03.04`);
  assert.equal(programs.applicable, true);
  assert.deepEqual(programs.items.map(i => i.university.slug), ['hse']);
  assert.ok(programs.items[0]!.benefits.length > 0);
  assert.ok(programs.items[0]!.programs.length > 0 && programs.items[0]!.programs.every(p => p.direction.code === '09.03.04'));
  const everywhere = await get(c.OlympiadProgramsResponse, `/olympiads/${card.id}/programs`);
  const benefitUniversities = new Set(card.benefits!.items.map(b => b.university.slug));
  assert.ok(everywhere.items.every(i => benefitUniversities.has(i.university.slug)));
  assert.ok(everywhere.items.some(i => i.programs.some(p => p.examMatch)));

  // A card whose profile is outside the RSOSH list gives no benefit, so no programs either.
  const philology = await get(c.OlympiadProgramsResponse, '/olympiads/6962/programs');
  assert.equal(philology.applicable, false); assert.deepEqual(philology.items, []);
  assert.equal((await app.inject('/olympiads/999999999/programs')).statusCode, 404);
});

test('universities list and page show programs', async () => {
  const list = await get(c.UniversityListResponse, '/universities');
  assert.ok(list.items.every(u => (u.programCount ?? 0) > 0));
  const innopolis = await get(c.UniversityResponse, '/universities/innopolis');
  assert.equal(innopolis.programs!.length, 5);
  assert.ok(innopolis.programs!.every(p => p.sourceUrl.startsWith('https://apply.innopolis.university/')));
  const codes = innopolis.programs!.map(p => p.direction.code);
  assert.deepEqual(codes, [...codes].sort());
});

test('the goal in the profile: directions and universities survive a re-import and go with the account', async () => {
  const signIn = async (id: number) => {
    const response = await app.inject({ method: 'POST', url: '/auth/max', payload: { initData: signedInitData(id, new Date(`${today}T10:00:00Z`)) } });
    assert.equal(response.statusCode, 200, response.body);
    const data = c.AuthResponse.parse(response.json());
    return { user: data.user, headers: { authorization: `Bearer ${data.accessToken}` } };
  };
  const a = await signIn(901);
  assert.deepEqual(a.user.directions, []); assert.deepEqual(a.user.universities, []);
  const registration = await app.inject({ method: 'POST', url: '/me/registration', headers: a.headers,
    payload: { name: 'Артём', grade: 9, region: 'Республика Татарстан', subjects: [], online: true, onsite: true, directions: ['09.03.04', '10.03.01'], universities: ['kazan-fu', 'hse'] } });
  assert.equal(registration.statusCode, 200, registration.body);
  const registered = c.UserProfile.parse(registration.json());
  assert.deepEqual(registered.directions, ['09.03.04', '10.03.01']);
  assert.deepEqual(registered.universities, ['hse', 'kazan-fu']);
  // A registration without the new fields (an older client) keeps working.
  const b = await signIn(902);
  const legacy = await app.inject({ method: 'POST', url: '/me/registration', headers: b.headers, payload: { name: 'Борис', grade: 10, region: '', subjects: [], online: true, onsite: true } });
  assert.equal(legacy.statusCode, 200, legacy.body); assert.deepEqual(legacy.json().directions, []);

  for (const payload of [{ directions: ['99.03.99'] }, { universities: ['nowhere'] }, { directions: ['09.03.04', '09.03.04'] }, { directions: ['09.04.01'] }]) {
    const response = await app.inject({ method: 'PATCH', url: '/me/profile', headers: a.headers, payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  const patched = await app.inject({ method: 'PATCH', url: '/me/profile', headers: a.headers, payload: { directions: ['09.03.04'] } });
  assert.equal(patched.statusCode, 200); assert.deepEqual(patched.json().directions, ['09.03.04']); assert.deepEqual(patched.json().universities, ['hse', 'kazan-fu']);

  // Re-import keeps direction and university ids, so the goal stays.
  await applyReference(connection.db, reference);
  const me = c.UserProfile.parse((await app.inject({ url: '/me', headers: a.headers })).json());
  assert.deepEqual(me.directions, ['09.03.04']); assert.deepEqual(me.universities, ['hse', 'kazan-fu']);

  assert.equal((await app.inject({ method: 'DELETE', url: '/me', headers: a.headers })).statusCode, 204);
  assert.equal(await count(`select count(*) from user_directions where user_id = '${a.user.id}'`), 0);
  assert.equal(await count(`select count(*) from user_universities where user_id = '${a.user.id}'`), 0);
});

test('«на N из M направлений»: estimate by exams on every card, exact rules replace it for their university', async () => {
  const [{ id }] = (await connection.pool.query(`select o.id from olympiads o join olympiad_series_links l on l.olympiad_id = o.id
    join olympiad_series s on s.id = l.series_id where s.slug = 'vuz-academic-informatics' and o.in_catalog and o.level is not null limit 1`)).rows;
  const card = await get(c.OlympiadDetail, `/olympiads/${id}`);
  const itmo = card.benefits!.items.find(b => b.university.slug === 'itmo')!;
  assert.equal(itmo.coverage?.source, 'exams');
  assert.ok(itmo.coverage!.matched > 0 && itmo.coverage!.matched <= itmo.coverage!.total);
  const itmoDirections = await count(`select count(distinct direction_id) from university_programs p join universities u on u.id = p.university_id where u.slug = 'itmo'`);
  assert.equal(itmo.coverage!.total, itmoDirections);
  const programs = await get(c.OlympiadProgramsResponse, `/olympiads/${id}/programs?universities=itmo`);
  assert.deepEqual(programs.items[0]!.coverage, itmo.coverage);
  // A card outside the RSOSH list gives no benefit: no coverage either.
  assert.equal((await get(c.OlympiadDetail, '/olympiads/6962')).benefits!.items.length, 0);

  // Exact rows from admission rules for ITMO only.
  const input = readReferenceDir();
  const manifest = structuredClone(input.manifest) as { sources: Record<string, unknown> };
  manifest.sources.directionBenefits = [{ file: 'sources/direction_benefits_test.csv' }];
  const rows = ['09.03.04', '09.03.02', '01.03.02'].map(code => `itmo;Вузовско-академическая олимпиада по информатике;${code};БВИ;https://abit.itmo.ru/rules.pdf;7`).join('\n');
  const exact = buildReference({ manifest, files: { ...input.files, 'sources/direction_benefits_test.csv':
    Buffer.from('university_slug;olympiad;direction_code;benefit;source_url;source_page\n' + rows + '\n') } }, { today });
  const report = await applyReference(connection.db, exact);
  assert.equal(report.directionBenefits, 3);
  const after = await get(c.OlympiadDetail, `/olympiads/${id}`);
  const itmoExact = after.benefits!.items.find(b => b.university.slug === 'itmo')!;
  assert.equal(itmoExact.coverage?.source, 'rules'); assert.equal(itmoExact.coverage?.matched, 3);
  assert.ok(itmoExact.coverage!.total >= itmoDirections);
  assert.equal(after.benefits!.items.find(b => b.university.slug === 'hse')?.coverage?.source, 'exams');
  await applyReference(connection.db, reference);
  assert.equal(await count('select count(*) from direction_benefits'), 0);
});
