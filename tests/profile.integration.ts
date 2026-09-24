import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { connectDatabase } from '../apps/api/src/db/client.js';
import { buildApp } from '../apps/api/src/app.js';
import { importCsv } from '../apps/api/src/import/importer.js';
import { signedInitData, testBotToken } from './fixtures.js';
import * as c from '../packages/contracts/src/index.js';

// Dedicated disposable database: real user profiles and plans are never modified by tests.
test('MAX registration, profile persistence, migration and account isolation', async t => {
  assert(process.env.DATABASE_URL);
  const admin = connectDatabase(process.env.DATABASE_URL);
  const name = `olimp_profile_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + name;
  const connection = connectDatabase(url.toString());
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  t.after(async () => {
    await app?.close(); await connection.pool.end();
    try { await admin.pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); } finally { await admin.pool.end(); }
  });
  await admin.pool.query(`CREATE DATABASE "${name}"`);
  const folder = new URL('../apps/api/drizzle/', import.meta.url);
  const files = readdirSync(folder).filter(f => f.endsWith('.sql')).sort();
  for (const file of files.slice(0, 2)) await connection.pool.query(readFileSync(new URL(file, folder), 'utf8'));
  await importCsv(connection.db, readFileSync(new URL('../olimpiady.csv', import.meta.url)), 'test.csv');
  const legacyId = randomUUID();
  await connection.pool.query('insert into user_profiles (id, max_user_id, display_name) values ($1, $2, $3)', [legacyId, '700', 'Существующий пользователь']);
  await connection.pool.query('insert into plan_items (user_id, olympiad_id, note, tracking) values ($1, 88, $2, false)', [legacyId, 'Сохранить заметку']);
  for (const file of files.slice(2)) await connection.pool.query(readFileSync(new URL(file, folder), 'utf8'));
  const config = { db: connection.db, botToken: testBotToken, jwtSecret: 'profile-test'.repeat(5) };
  app = await buildApp(config);
  const signIn = async (id: number) => {
    const response = await app!.inject({ method: 'POST', url: '/auth/max', payload: { initData: signedInitData(id) } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers['cache-control'], 'no-store');
    const data = c.AuthResponse.parse(response.json());
    return { ...data, headers: { authorization: `Bearer ${data.accessToken}` } };
  };
  const legacy = await signIn(700);
  assert.equal(legacy.user.id, legacyId); assert(legacy.user.registeredAt);
  const legacyPlan = c.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: legacy.headers })).json());
  assert.equal(legacyPlan.items[0]?.note, 'Сохранить заметку'); assert.equal(legacyPlan.items[0]?.tracking, false);
  const a = await signIn(701), b = await signIn(702);
  assert.equal(a.user.registeredAt, null);
  const preferences: c.ProfilePreferences = { name: 'Анна', grade: 10, region: 'Москва', subjects: [8, 18], online: false, onsite: true };
  assert.equal((await app.inject({ method: 'POST', url: '/me/registration', payload: preferences })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/profile', headers: a.headers, payload: { name: 'Рано' } })).statusCode, 409);
  const registration = await app.inject({ method: 'POST', url: '/me/registration', headers: a.headers, payload: preferences });
  assert.equal(registration.statusCode, 200, registration.body);
  const registered = c.UserProfile.parse(registration.json()); assert(registered.registeredAt);
  assert.equal(registered.id, a.user.id); assert.equal(registered.name, 'Анна');
  assert.equal((await app.inject({ method: 'POST', url: '/me/registration', headers: a.headers, payload: { ...preferences, name: 'Перезапись' } })).statusCode, 409);
  const freshA = await signIn(701); assert.equal(freshA.user.name, 'Анна'); assert.equal(freshA.user.id, a.user.id);
  assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/88', headers: freshA.headers })).statusCode, 204);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: freshA.headers, payload: { note: 'Личная заметка' } })).statusCode, 204);
  const saved = await app.inject({ method: 'PATCH', url: '/me/profile', headers: a.headers, payload: { subjects: [8], grade: 11 } });
  assert.equal(saved.statusCode, 200); assert.equal(saved.headers['cache-control'], 'no-store');
  const invalid = [ { userId: b.user.id, grade: 9 }, { maxUserId: '702' }, { registeredAt: null }, { grade: 12 }, { name: '  ' }, { subjects: [8, 8] }, { subjects: [2147483647], name: 'Не сохранять' }, {} ];
  for (const payload of invalid) assert.equal((await app.inject({ method: 'PATCH', url: '/me/profile', headers: a.headers, payload })).statusCode, 400);
  assert.equal((await app.inject({ url: '/me', headers: b.headers })).json().registeredAt, null);
  assert.equal((await app.inject({ url: '/me/plan', headers: b.headers })).json().total, 0);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: b.headers, payload: { note: 'Чужое' } })).statusCode, 404);
  await app.close(); app = await buildApp(config);
  const persisted = await signIn(701);
  assert.equal(persisted.user.name, 'Анна'); assert.equal(persisted.user.grade, 11); assert.deepEqual(persisted.user.subjects, [8]); assert.equal(persisted.user.online, false);
  assert.equal((await app.inject({ url: '/me/plan', headers: persisted.headers })).json().items[0].note, 'Личная заметка');
  const counts = await connection.pool.query("select count(*) from user_profiles where max_user_id = '701'"); assert.equal(Number(counts.rows[0].count), 1);
  await assert.rejects(connection.pool.query('update user_profiles set grade = 12 where id = $1', [a.user.id]), /check constraint/);
  // Two competing registration requests can never overwrite one another.
  const both = await Promise.all(['Борис', 'Другое имя'].map(name => app!.inject({ method: 'POST', url: '/me/registration', headers: b.headers, payload: { ...preferences, name } })));
  assert.deepEqual(both.map(r => r.statusCode).sort(), [200, 409]);
});
