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
  assert.deepEqual(first, { users: 3, messages: 1, reminders: 1, changes: 0, failed: 2, unreachable: 1 });
  assert.deepEqual(messenger.sent.map(s => s.userId), [901]);
  assert.match(messenger.sent[0]!.text, /Регистрация закрывается через 3 дня — 4 октября, вс/);
  assert.doesNotMatch(messenger.sent[0]!.text, /каталоге/, 'a verified date carries no estimate note');

  // Second pass the same morning: nothing repeats, the transient failure is retried, the refusal is not.
  const second = await runReminders(db, messenger, options);
  assert.deepEqual(second, { users: 1, messages: 1, reminders: 1, changes: 0, failed: 0, unreachable: 0 });
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
  // Links with a start payload: «Подключить напоминания» from the mini-app and a link to an olympiad.
  calls.length = 0;
  await handle({ update_type: 'bot_started', chat_id: 1001, user: user(907), payload: 'notify' });
  assert.match(calls.find(call => call.path.startsWith('/messages'))!.body.text, /Бот подключён[\s\S]*по Москве\. Укажите регион/);
  calls.length = 0;
  await handle({ update_type: 'bot_started', chat_id: 1001, user: user(908), payload: 'olympiad_88' });
  const linked = calls.find(call => call.path.startsWith('/messages'))!.body;
  assert.match(linked.text, /по ссылке на олимпиаду «Всероссийская олимпиада по английскому языку»/);
  assert.equal(linked.attachments[0].payload.buttons[0][0].payload, 'olympiad_88');

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
  const hint = calls.filter(call => call.path.startsWith('/messages')).at(-1)!.body;
  assert.match(hint.text, /Сам я на вопросы не отвечаю/);
  const ask = hint.attachments[0].payload.buttons[0][0];
  assert.equal(ask.type, 'open_app');
  assert.equal(Buffer.from(ask.payload.replace(/^ask_/, ''), 'base64url').toString('utf8'), 'когда олимпиада по физике?', 'the question opens Olimp\'s chat already typed in');

  // «✅ Я зарегистрировался»: planned → registered once, undo back; a status set further in the app is kept.
  const status = async (maxUserId: string) => (await pool.query(`select status from plan_items p join user_profiles u on u.id = p.user_id where u.max_user_id = $1 and p.olympiad_id = 88`, [maxUserId])).rows[0]?.status;
  const lastAnswer = () => calls.filter(call => call.path.startsWith('/answers')).at(-1)!.body;
  await handle(press(901, 'reg:88'));
  assert.equal(await status('901'), 'registered');
  assert.equal(lastAnswer().notification, 'Отметил: вы зарегистрированы');
  assert.match(calls.filter(call => call.path.startsWith('/messages')).at(-1)!.body.text, /О регистрации больше не напоминаю/);
  await handle(press(901, 'reg:88'));
  assert.match(lastAnswer().notification, /уже стоит статус «зарегистрирован»/);
  await handle(press(901, 'unreg:88'));
  assert.equal(await status('901'), 'planned');
  await pool.query(`update plan_items set status = 'in_progress' where olympiad_id = 88 and user_id = (select id from user_profiles where max_user_id = '901')`);
  await handle(press(901, 'unreg:88'));
  assert.equal(await status('901'), 'in_progress', 'undo never moves a status set in the app');
  await handle(press(906, 'reg:88'));
  assert.match(lastAnswer().notification, /нет в вашем плане/);

  // The registration deadline moves from 4 to 12 October: one «сроки изменились» notice per pupil, retried after a failure.
  await pool.query(`update olympiad_stages set ends_on = '2026-10-12' where source_key = 'test-registration'`);
  const flaky = new Set<number>([905]);
  const moving = fakeMessenger(userId => flaky.delete(userId) ? new DeliveryError('MAX 502 bad gateway', false) : null);
  // 904 is blocked here (its test message was refused above), so only 905 is written to — and the first try fails.
  const moved = await runReminders(db, moving, { ...options, now: later });
  assert.deepEqual(moved, { users: 1, messages: 0, reminders: 0, changes: 0, failed: 1, unreachable: 0 });
  assert.deepEqual((await runReminders(db, moving, { ...options, now: later })).changes, 1, 'the failed notice goes out on the next pass');
  assert.deepEqual(moving.sent.map(s => s.userId), [905]);
  assert.match(moving.sent[0]!.text, /Изменились сроки олимпиад из вашего плана[\s\S]*Регистрация закрывается через 9 дней — 12 октября, пн \(было 4 октября\)/);
  assert.equal((await runReminders(db, moving, { ...options, now: later })).users, 0, 'and never again');

  // Sending hours are local: at 10:00 Moscow it is 17:00 in Vladivostok. 904 has no region — Moscow time.
  await pool.query(`update user_profiles set region = 'Приморский край' where max_user_id = '905'`);
  const hours = { from: 16, until: 21 };
  const weekBefore = fakeMessenger();
  await runReminders(db, weekBefore, { ...options, hours, now: new Date('2026-10-05T07:00:00Z') });
  assert.deepEqual(weekBefore.sent.map(s => s.userId), [905]);
  assert.match(weekBefore.sent[0]!.text, /закрывается через 7 дней/);
  // 904 starts the bot again: its week-before reminder and the move it has not heard of are one line.
  await recordBotStarted(db, { maxUserId: '904', displayName: 'Тест' }, now);
  await runReminders(db, weekBefore, { ...options, hours, now: new Date('2026-10-05T13:00:00Z') });
  assert.deepEqual(weekBefore.sent.map(s => s.userId), [905, 904], '16:00 in Moscow');
  assert.match(weekBefore.sent[1]!.text, /закрывается через 7 дней — 12 октября, пн \(было 4 октября\)/);
  assert.doesNotMatch(weekBefore.sent[1]!.text, /Изменились сроки/);
  await handle({ update_type: 'bot_stopped', chat_id: 1001, user: user(906) });
  assert.notEqual((await pool.query(`select bot_blocked_at from user_profiles where max_user_id = '906'`)).rows[0].bot_blocked_at, null);

  // Deleting the account removes its reminder log.
  assert.equal((await app.inject({ method: 'DELETE', url: '/me', headers: a.headers })).statusCode, 204);
  assert.equal(Number((await pool.query(`select count(*) from reminders where user_id = $1`, [a.user.id])).rows[0].count), 0);
});
