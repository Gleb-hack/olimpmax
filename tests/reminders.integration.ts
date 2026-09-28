import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { connectDatabase } from '../apps/api/src/db/client.js';
import { buildApp } from '../apps/api/src/app.js';
import { importCsv } from '../apps/api/src/import/importer.js';
import { DeliveryError, type Messenger } from '../apps/api/src/features/reminders/max.js';
import { recordBotStarted, runReminders, previewReminders } from '../apps/api/src/features/reminders/delivery.js';
import { createBot } from '../apps/bot/src/bot.js';
import { signedInitData, testBotToken } from './fixtures.js';
import * as c from '../packages/contracts/src/index.js';

type Sent = { userId: number; text: string; buttons: unknown };
function fakeMessenger(fail: (userId: number) => DeliveryError | null = () => null): Messenger & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    identity: async () => ({ username: 'olimp_test_bot', userId: 42 }),
    async sendToUser(userId, text, keyboard) {
      const error = fail(userId);
      if (error) throw error;
      sent.push({ userId, text, buttons: keyboard?.payload.buttons });
    },
  };
}

// Dedicated disposable database, as in account.integration.ts.
test('reminders: due today, once per threshold, retries and refusals, settings API and bot buttons', async t => {
  assert(process.env.DATABASE_URL);
  const admin = connectDatabase(process.env.DATABASE_URL);
  const name = `olimp_reminders_test_${randomUUID().replaceAll('-', '')}`;
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
  await importCsv(connection.db, readFileSync(new URL('../data/catalog/olimpiady.csv', import.meta.url)), 'test.csv');
  const { db, pool } = connection;
  // A verified registration deadline three days after «today» (1 October, 10:00 Moscow).
  await pool.query(`insert into olympiad_stages (olympiad_id, source_key, origin, name, kind, ends_on, verification, source_url, verified_at, calendar_hash)
    select 88, 'test-registration', 'verified_import', 'Регистрация', 'registration', '2026-10-04', 'verified', 'https://example.org/rules', now(), calendar_hash from olympiads where id = 88`);
  const now = new Date('2026-10-01T07:00:00Z');
  const transient = new Set<number>([905]);
  const messenger = fakeMessenger(userId => userId === 904 ? new DeliveryError('MAX 403 chat.denied', true)
    : transient.delete(userId) ? new DeliveryError('MAX 502 bad gateway', false) : null);
  app = await buildApp({ db, botToken: testBotToken, jwtSecret: 'reminder-test'.repeat(4), messenger, now: () => now });
  const signIn = async (id: number) => {
    const data = c.AuthResponse.parse((await app!.inject({ method: 'POST', url: '/auth/max', payload: { initData: signedInitData(id, now) } })).json());
    const headers = { authorization: `Bearer ${data.accessToken}` };
    assert.equal((await app!.inject({ method: 'PUT', url: '/me/plan/88', headers })).statusCode, 204);
    return { ...data, headers };
  };
  const [a, off, muted] = [await signIn(901), await signIn(902), await signIn(903)];
  await signIn(904); await signIn(905);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me/plan/88', headers: off.headers, payload: { tracking: false } })).statusCode, 204);
  const settings = c.NotificationSettings.parse((await app.inject({ method: 'PATCH', url: '/me/notifications', headers: muted.headers, payload: { enabled: false } })).json());
  assert.deepEqual(settings, { enabled: false, botConnected: false, botUrl: 'https://max.ru/olimp_test_bot' });

  const options = { now, includeEstimated: false, pauseMs: 0 };
  assert.deepEqual((await previewReminders(db, options)).map(p => p.maxUserId).sort(), ['901', '904', '905']);
  const first = await runReminders(db, messenger, options);
  assert.deepEqual(first, { users: 3, messages: 1, reminders: 1, failed: 2, unreachable: 1 });
  assert.deepEqual(messenger.sent.map(s => s.userId), [901]);
  assert.match(messenger.sent[0]!.text, /Регистрация закрывается через 3 дня — 4 октября, вс/);
  assert.doesNotMatch(messenger.sent[0]!.text, /каталоге/, 'a verified date carries no estimate note');

  // Second pass the same morning: nothing repeats, the transient failure is retried, the refusal is not.
  const second = await runReminders(db, messenger, options);
  assert.deepEqual(second, { users: 1, messages: 1, reminders: 1, failed: 0, unreachable: 0 });
  assert.deepEqual(messenger.sent.map(s => s.userId), [901, 905]);
  assert.deepEqual((await runReminders(db, messenger, options)).users, 0);
  const blocked = await pool.query(`select bot_blocked_at from user_profiles where max_user_id = '904'`);
  assert.notEqual(blocked.rows[0].bot_blocked_at, null);

  // Two days later the «1 day» threshold fires; 904 pressed «Начать» meanwhile and gets it too.
  await recordBotStarted(db, { maxUserId: '904', displayName: 'Тест' }, now);
  messenger.sent.length = 0;
  const later = new Date('2026-10-03T07:00:00Z');
  const allowed = fakeMessenger();
  await runReminders(db, allowed, { ...options, now: later });
  assert.deepEqual(allowed.sent.map(s => s.userId).sort(), [901, 904, 905]);
  assert.match(allowed.sent[0]!.text, /закрывается завтра/);

  // «Прислать тестовое напоминание» sends the nearest real deadline of the plan.
  const tested = await app.inject({ method: 'POST', url: '/me/notifications/test', headers: a.headers });
  assert.equal(tested.statusCode, 200, tested.body);
  assert.match(messenger.sent.at(-1)!.text, /Тестовое напоминание[\s\S]*Регистрация закрывается/);
  const refused = await app.inject({ method: 'POST', url: '/me/notifications/test', headers: (await signIn(904)).headers });
  assert.equal(refused.statusCode, 409);

  // The bot: «Начать», /plan, mute and unmute buttons, turning reminders off, stopping the bot.
  const calls: { path: string; body: any }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path: target.pathname + target.search, body });
    const data = target.pathname === '/me' ? { user_id: 42, username: 'olimp_test_bot', first_name: 'Olimp', is_bot: true, name: 'Olimp', last_activity_time: 0 }
      : target.pathname === '/messages' ? { message: { recipient: { chat_id: 1001, chat_type: 'dialog' }, timestamp: 0, body: { mid: 'm', seq: 1, text: body?.text } } }
      : { success: true };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  const { bot } = createBot({ db, token: 'fake-token', includeEstimated: false, reminderHour: 10, clientOptions: { fetch }, now: () => now });
  const handle = (update: object) => (bot as unknown as { handleUpdate(u: object): Promise<void> }).handleUpdate({ timestamp: Date.now(), ...update });
  const user = (id: number) => ({ user_id: id, first_name: 'Аня', last_name: '', name: 'Аня', username: null, is_bot: false, last_activity_time: 0 });
  const message = (id: number, text: string) => ({ update_type: 'message_created', message: { sender: user(id), recipient: { chat_id: 1001, chat_type: 'dialog', user_id: null, post_id: null }, timestamp: 0, body: { mid: 'm1', seq: 1, text } } });
  const press = (id: number, payload: string) => ({ update_type: 'message_callback', callback: { timestamp: 0, callback_id: 'cb-' + payload, payload, user: user(id) }, message: { recipient: { chat_id: 1001, chat_type: 'dialog', user_id: null, post_id: null }, timestamp: 0, body: { mid: 'm2', seq: 2, text: '' } } });
  const tracking = async (maxUserId: string) => (await pool.query(`select tracking from plan_items p join user_profiles u on u.id = p.user_id where u.max_user_id = $1 and p.olympiad_id = 88`, [maxUserId])).rows[0]?.tracking;

  await handle({ update_type: 'bot_started', chat_id: 1001, user: user(906) });
  const started = await pool.query(`select bot_started_at, registered_at from user_profiles where max_user_id = '906'`);
  assert.notEqual(started.rows[0].bot_started_at, null, '«Начать» creates the account and marks the dialog as open');
  const welcome = calls.find(call => call.path.startsWith('/messages'));
  assert.match(welcome!.body.text, /Привет, Аня!/);
  assert.equal(welcome!.body.attachments[0].payload.buttons[0][0].type, 'open_app');

  calls.length = 0;
  await handle(message(901, '/plan'));
  assert.match(calls.find(call => call.path.startsWith('/messages'))!.body.text, /Ближайшие сроки[\s\S]*Регистрация закрывается/);
  await handle(press(901, 'mute:88'));
  assert.equal(await tracking('901'), false);
  assert.ok(calls.some(call => call.path.startsWith('/answers') && call.body.notification));
  assert.match(calls.filter(call => call.path.startsWith('/messages')).at(-1)!.body.text, /Больше не напоминаю/);
  await handle(press(901, 'unmute:88'));
  assert.equal(await tracking('901'), true);
  await handle(press(901, 'notify:off'));
  const answer = calls.filter(call => call.path.startsWith('/answers')).at(-1)!;
  assert.match(answer.body.message.text, /выключены/, 'the settings message is redrawn in place');
  assert.equal(c.NotificationSettings.parse((await app.inject({ url: '/me/notifications', headers: a.headers })).json()).enabled, false);
  await handle(message(901, 'когда олимпиада по физике?'));
  assert.match(calls.filter(call => call.path.startsWith('/messages')).at(-1)!.body.text, /Олимп — чат-помощник/);
  await handle({ update_type: 'bot_stopped', chat_id: 1001, user: user(906) });
  assert.notEqual((await pool.query(`select bot_blocked_at from user_profiles where max_user_id = '906'`)).rows[0].bot_blocked_at, null);

  // Deleting the account removes its reminder log.
  assert.equal((await app.inject({ method: 'DELETE', url: '/me', headers: a.headers })).statusCode, 204);
  assert.equal(Number((await pool.query(`select count(*) from reminders where user_id = $1`, [a.user.id])).rows[0].count), 0);
});
