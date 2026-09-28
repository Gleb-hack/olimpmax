import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bucketFor, dueReminders, upcomingEvents, type ReminderItem } from '../apps/api/src/features/reminders/schedule.js';
import { describeEvent, formatDay, pluralDays, reminderKeyboard, reminderText, ESTIMATE_NOTE } from '../apps/api/src/features/reminders/format.js';
import { MaxError, toDeliveryError } from '../apps/api/src/features/reminders/max.js';
import { moscowHour } from '../apps/bot/src/scheduler.js';

const event = (stageKind: 'registration' | 'competition' | 'other', kind: 'starts' | 'ends' | 'day', date: string, extra: { stageId?: string; name?: string | null; estimated?: boolean } = {}) =>
  ({ stageId: extra.stageId ?? randomUUID(), name: extra.name ?? null, stageKind, kind, date, estimated: extra.estimated ?? false });
const item = (events: ReminderItem['events'], extra: Partial<ReminderItem> = {}): ReminderItem => ({ olympiadId: 88, title: 'Высшая проба', tracking: true, events, ...extra });
const TODAY = '2026-10-01';

test('a threshold fires once: the smallest one that still covers the days left', () => {
  const offsets = [7, 3, 1, 0];
  assert.equal(bucketFor(offsets, 8), null);
  assert.equal(bucketFor(offsets, 7), 7);
  assert.equal(bucketFor(offsets, 5), 7);
  assert.equal(bucketFor(offsets, 3), 3);
  assert.equal(bucketFor(offsets, 2), 3);
  assert.equal(bucketFor(offsets, 0), 0);
  assert.equal(bucketFor(offsets, -1), null);
});

test('registration deadlines are reminded a week ahead, stage starts three days ahead', () => {
  const due = dueReminders([item([
    event('registration', 'ends', '2026-10-06'),
    event('competition', 'starts', '2026-10-04', { name: 'отборочный этап' }),
    event('competition', 'starts', '2026-10-05'),
    event('registration', 'ends', '2026-09-30'),
  ])], TODAY, { includeEstimated: true });
  assert.deepEqual(due.map(d => [d.eventKey, d.bucket, d.daysLeft]), [
    ['competition:starts:2026-10-04', 3, 3],
    ['registration:ends:2026-10-06', 7, 5],
  ]);
});

test('untracked olympiads and, when asked, estimated dates are skipped', () => {
  const events = [event('registration', 'ends', '2026-10-02', { estimated: true })];
  assert.equal(dueReminders([item(events, { tracking: false })], TODAY, { includeEstimated: true }).length, 0);
  assert.equal(dueReminders([item(events)], TODAY, { includeEstimated: false }).length, 0);
  assert.equal(dueReminders([item(events)], TODAY, { includeEstimated: true })[0]?.bucket, 1);
});

test('the end of a stage is reminded only for long windows, the day before', () => {
  const window = randomUUID(), final = randomUUID();
  const due = dueReminders([item([
    event('competition', 'starts', '2026-09-20', { stageId: window }), event('competition', 'ends', '2026-10-02', { stageId: window }),
    event('competition', 'starts', '2026-09-30', { stageId: final }), event('competition', 'ends', '2026-10-02', { stageId: final }),
  ])], TODAY, { includeEstimated: true });
  assert.deepEqual(due.map(d => [d.eventKey, d.bucket]), [['competition:ends:2026-10-02', 1]]);
});

test('stage ids do not take part in the key: re-imported reference stages do not repeat a reminder', () => {
  const a = dueReminders([item([event('registration', 'ends', '2026-10-03')])], TODAY, { includeEstimated: true });
  const b = dueReminders([item([event('registration', 'ends', '2026-10-03'), event('registration', 'ends', '2026-10-03')])], TODAY, { includeEstimated: true });
  assert.deepEqual(a.map(d => d.eventKey), b.map(d => d.eventKey));
});

test('upcoming events for /plan list every future date of tracked olympiads', () => {
  const list = upcomingEvents([item([event('registration', 'ends', '2026-11-20'), event('competition', 'day', '2027-03-01')]), item([event('other', 'day', '2026-10-01')], { olympiadId: 5, tracking: false })],
    TODAY, 60, { includeEstimated: true });
  assert.deepEqual(list.map(d => [d.eventDate, d.daysLeft]), [['2026-11-20', 50]]);
});

test('Russian wording: days, dates and events', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(pluralDays), ['1 день', '2 дня', '5 дней', '11 дней', '21 день', '22 дня', '25 дней']);
  assert.equal(formatDay('2026-10-05'), '5 октября, пн');
  assert.equal(describeEvent({ stageKind: 'registration', eventKind: 'ends', stageName: null, daysLeft: 1, eventDate: '2026-10-02' }), 'Регистрация закрывается завтра — 2 октября, пт');
  assert.equal(describeEvent({ stageKind: 'competition', eventKind: 'starts', stageName: 'отборочный этап', daysLeft: 3, eventDate: '2026-10-04' }), 'Отборочный этап начинается через 3 дня — 4 октября, вс');
  assert.equal(describeEvent({ stageKind: 'competition', eventKind: 'day', stageName: 'Дополнительная дата', daysLeft: 0, eventDate: '2026-10-01' }), 'Этап олимпиады: сегодня — 1 октября, чт');
});

test('one message per user: grouped by olympiad, escaped, with a note on estimated dates', () => {
  const due = dueReminders([
    item([event('registration', 'ends', '2026-10-03', { estimated: true })], { title: 'Олимпиада <ОММО> & друзья' }),
    item([event('competition', 'starts', '2026-10-02')], { olympiadId: 5, title: 'Физтех' }),
  ], TODAY, { includeEstimated: true });
  const text = reminderText(due);
  assert.match(text, /<b>Олимпиада &lt;ОММО&gt; &amp; друзья<\/b>/);
  assert.match(text, /Физтех/);
  assert.ok(text.includes(ESTIMATE_NOTE));
  assert.match(text, /закрывается послезавтра — 3 октября, сб\*/, 'only estimated lines get the mark when dates are mixed');
  assert.doesNotMatch(reminderText(due.filter(d => !d.estimated)), /каталоге/);
});

test('keyboard: one olympiad — open and mute; several — one button each; no identity — no open buttons', () => {
  const identity = { username: 'olimp_bot', userId: 42 };
  const one = dueReminders([item([event('registration', 'ends', '2026-10-03')])], TODAY, { includeEstimated: true });
  assert.deepEqual(reminderKeyboard(one, identity).payload.buttons, [
    [{ type: 'open_app', text: 'Открыть карточку', web_app: 'olimp_bot', contact_id: 42, payload: 'olympiad_88' }],
    [{ type: 'callback', text: '🔕 Не напоминать об этой олимпиаде', payload: 'mute:88' }],
  ]);
  const two = [...one, ...dueReminders([item([event('registration', 'ends', '2026-10-03')], { olympiadId: 5, title: 'Физтех' })], TODAY, { includeEstimated: true })];
  const rows = reminderKeyboard(two, identity).payload.buttons;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], [{ type: 'open_app', text: 'Физтех', web_app: 'olimp_bot', contact_id: 42, payload: 'olympiad_5' }]);
  assert.ok(reminderKeyboard(two, null).payload.buttons.flat().every(button => button.type === 'callback'));
});

test('MAX refusals stop retries, other failures are retried', () => {
  assert.equal(toDeliveryError(new MaxError(403, { code: 'chat.denied', message: 'denied' })).unreachable, true);
  assert.equal(toDeliveryError(new MaxError(404, { code: 'not.found', message: 'no dialog' })).unreachable, true);
  assert.equal(toDeliveryError(new MaxError(429, { code: 'too.many.requests', message: 'slow down' })).unreachable, false);
  assert.equal(toDeliveryError(new Error('socket hang up')).unreachable, false);
});

test('sending hours are Moscow hours', () => {
  assert.equal(moscowHour(new Date('2026-10-01T07:00:00Z')), 10);
  assert.equal(moscowHour(new Date('2026-10-01T21:30:00Z')), 0);
});
