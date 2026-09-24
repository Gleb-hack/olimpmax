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
test('account export contains all personal data and account deletion removes it', async t => {
  assert(process.env.DATABASE_URL);
  const admin = connectDatabase(process.env.DATABASE_URL);
  const name = `olimp_account_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL); url.pathname = '/' + name;
  const connection = connectDatabase(url.toString());
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  t.after(async () => {
    await app?.close(); await connection.pool.end();
    try { await admin.pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); } finally { await admin.pool.end(); }
  });
  await admin.pool.query(`CREATE DATABASE "${name}"`);
  const folder = new URL('../apps/api/drizzle/', import.meta.url);
  for (const file of readdirSync(folder).filter(f => f.endsWith('.sql')).sort()) await connection.pool.query(readFileSync(new URL(file, folder), 'utf8'));
  await importCsv(connection.db, readFileSync(new URL('../olimpiady.csv', import.meta.url)), 'test.csv');
  app = await buildApp({ db: connection.db, botToken: testBotToken, jwtSecret: 'account-test'.repeat(5) });
  const signIn = async (id: number) => {
    const data = c.AuthResponse.parse((await app!.inject({ method: 'POST', url: '/auth/max', payload: { initData: signedInitData(id) } })).json());
    return { ...data, headers: { authorization: `Bearer ${data.accessToken}` } };
  };
  const a = await signIn(801), b = await signIn(802);
  const preferences: c.ProfilePreferences = { name: 'Вера', grade: 9, region: 'Пермь', subjects: [8], online: true, onsite: false };
  assert.equal((await app.inject({ method: 'POST', url: '/me/registration', headers: a.headers, payload: preferences })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/88', headers: a.headers })).statusCode, 204);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: a.headers, payload: { note: 'Готовиться' } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'PUT', url: '/me/plan/88', headers: b.headers })).statusCode, 204);

  const device = { avatar: 'data:image/png;base64,iVBORw0KGgo=', searchHistory: ['химия'] };
  assert.equal((await app.inject({ method: 'POST', url: '/me/export', payload: { device } })).statusCode, 401);
  const prepared = await app.inject({ method: 'POST', url: '/me/export', headers: a.headers, payload: { device } });
  assert.equal(prepared.statusCode, 200, prepared.body);
  const ticket = c.ExportTicket.parse(prepared.json());
  const download = await app.inject({ url: ticket.path });
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers['cache-control'], 'no-store');
  assert.match(String(download.headers['content-disposition']), /^attachment; filename="olimpmax-data-\d{4}-\d{2}-\d{2}\.json"$/);
  const file = c.AccountExport.parse(download.json());
  assert.equal(file.account.id, a.user.id); assert.equal(file.account.maxUserId, '801');
  assert.equal(file.profile.name, 'Вера'); assert.equal(file.profile.region, 'Пермь');
  assert.deepEqual(file.profile.subjects.map(s => s.id), [8]); assert(file.profile.subjects[0]!.name);
  assert.deepEqual(file.plan.map(p => [p.olympiadId, p.note]), [[88, 'Готовиться']]);
  assert.deepEqual(file.device, device);
  assert.equal((await app.inject({ url: '/me/export/' + 'x'.repeat(43) })).statusCode, 404);

  assert.equal((await app.inject({ method: 'DELETE', url: '/me' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'DELETE', url: '/me', headers: a.headers })).statusCode, 204);
  assert.equal((await app.inject({ url: '/me', headers: a.headers })).statusCode, 401, 'the old token no longer works');
  assert.equal((await app.inject({ url: ticket.path })).statusCode, 404, 'a prepared export is dropped with the account');
  const left = await connection.pool.query('select (select count(*) from user_profiles where id = $1) + (select count(*) from plan_items where user_id = $1) + (select count(*) from user_subjects where user_id = $1) as n', [a.user.id]);
  assert.equal(Number(left.rows[0].n), 0);
  const other = c.PlanResponse.parse((await app.inject({ url: '/me/plan', headers: b.headers })).json());
  assert.equal(other.total, 1, 'other accounts are untouched');
  const again = await signIn(801);
  assert.notEqual(again.user.id, a.user.id); assert.equal(again.user.registeredAt, null);
});
