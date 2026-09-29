import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bucketFor, dueReminders, eventsSnapshot, scheduleChange, upcomingEvents, type ReminderItem } from '../apps/api/src/features/reminders/schedule.js';
import { describeEvent, formatDay, pluralDays, reminderKeyboard, reminderText, startParam, ESTIMATE_NOTE } from '../apps/api/src/features/reminders/format.js';
import { MaxError, toDeliveryError } from '../apps/api/src/features/reminders/max.js';
import { ALL_TIMEZONES, isKnownRegion, localDay, localHour, regionTimezone, withinHours } from '../apps/api/src/features/reminders/timezones.js';
import { anyoneWithinHours, moscowHour } from '../apps/bot/src/scheduler.js';
import { fallbackMessage, parseStartPayload, registeredNotice, welcomeMessage } from '../apps/bot/src/messages.js';
import { regionNames } from '../apps/web/src/lib/regions.js';

const event = (stageKind: 'registration' | 'competition' | 'other', kind: 'starts' | 'ends' | 'day', date: string, extra: { stageId?: string; name?: string | null; estimated?: boolean } = {}) =>
  ({ stageId: extra.stageId ?? randomUUID(), name: extra.name ?? null, stageKind, kind, date, estimated: extra.estimated ?? false });
const item = (events: ReminderItem['events'], extra: Partial<ReminderItem> = {}): ReminderItem => ({ olympiadId: 88, title: 'Высшая проба', tracking: true, events, ...extra });
const TODAY = '2026-10-01';
/** Callback and open_app buttons carry a payload; the union type of MAX buttons does not say so for every kind. */
const payloadOf = (button: unknown) => (button as { payload?: string }).payload;

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

test('keyboard: «registered» first for a registration date, then open and mute; several — a pair of rows each', () => {
  const identity = { username: 'olimp_bot', userId: 42 };
  const one = dueReminders([item([event('registration', 'ends', '2026-10-03')])], TODAY, { includeEstimated: true });
  assert.deepEqual(reminderKeyboard(one, identity).payload.buttons, [
    [{ type: 'callback', text: '✅ Я зарегистрировался', payload: 'reg:88' }],
    [{ type: 'open_app', text: 'Открыть карточку', web_app: 'olimp_bot', contact_id: 42, payload: 'olympiad_88' }],
    [{ type: 'callback', text: '🔕 Не напоминать об этой олимпиаде', payload: 'mute:88' }],
  ]);
  const stage = dueReminders([item([event('competition', 'starts', '2026-10-03')])], TODAY, { includeEstimated: true });
  assert.ok(reminderKeyboard(stage, identity).payload.buttons.flat().every(button => payloadOf(button) !== 'reg:88'), 'no registration date — no button');
  const two = [...one, ...dueReminders([item([event('competition', 'starts', '2026-10-03')], { olympiadId: 5, title: 'Физтех' })], TODAY, { includeEstimated: true })];
  const rows = reminderKeyboard(two, identity).payload.buttons;
  assert.deepEqual(rows.map(row => row.map(payloadOf)), [['olympiad_88'], ['reg:88'], ['olympiad_5'], ['plan', 'settings']]);
  assert.equal(rows[1]![0]!.text, '✅ Зарегистрировался · Высшая проба');
  assert.ok(reminderKeyboard(two, null).payload.buttons.flat().every(button => button.type === 'callback'));
});

test('MAX refusals stop retries, other failures are retried', () => {
  assert.equal(toDeliveryError(new MaxError(403, { code: 'chat.denied', message: 'denied' })).unreachable, true);
  assert.equal(toDeliveryError(new MaxError(404, { code: 'not.found', message: 'no dialog' })).unreachable, true);
  assert.equal(toDeliveryError(new MaxError(429, { code: 'too.many.requests', message: 'slow down' })).unreachable, false);
  assert.equal(toDeliveryError(new Error('socket hang up')).unreachable, false);
});

test('sending hours are the local hours of the profile region, Moscow when the region is unknown', () => {
  assert.equal(moscowHour(new Date('2026-10-01T07:00:00Z')), 10);
  assert.equal(moscowHour(new Date('2026-10-01T21:30:00Z')), 0);
  assert.equal(regionTimezone('Приморский край'), 'Asia/Vladivostok');
  assert.equal(regionTimezone('  приморский   КРАЙ '), 'Asia/Vladivostok', 'case and spaces do not matter');
  assert.equal(regionTimezone('Кемеровская область — Кузбасс'), 'Asia/Novokuznetsk');
  assert.equal(regionTimezone('Москва'), 'Europe/Moscow');
  assert.equal(regionTimezone(''), 'Europe/Moscow');
  assert.equal(isKnownRegion(''), false);
  assert.equal(isKnownRegion('Москва'), true, 'Moscow is a region too: no «fill in your region» hint');
  const at = new Date('2026-10-01T07:00:00Z'); // 10:00 Moscow, 17:00 Vladivostok, 09:00 Kaliningrad
  assert.equal(localHour(at, regionTimezone('Приморский край')), 17);
  assert.equal(localHour(at, regionTimezone('Калининградская область')), 9);
  const hours = { from: 16, until: 21 };
  assert.equal(withinHours(at, 'Asia/Vladivostok', hours), true);
  assert.equal(withinHours(at, 'Europe/Moscow', hours), false);
  // 01:00 UTC: 04:00 Moscow … 13:00 Kamchatka — before 16:00 everywhere.
  assert.equal(anyoneWithinHours(new Date('2026-10-01T01:00:00Z'), hours), false);
  assert.equal(anyoneWithinHours(at, hours), true);
  assert.equal(localDay(new Date('2026-10-01T13:30:00Z'), 'Asia/Kamchatka'), '2026-10-02', 'Kamchatka is already on the next day');
  for (const zone of ALL_TIMEZONES) assert.doesNotThrow(() => localHour(at, zone), zone);
});

test('every region of the profile list maps to a zone that exists; regions east of the Urals are not left on Moscow time', () => {
  const east = regionNames.filter(name => /Сибирск|Дальневост|Уральск/.test(name) || ['Омская область', 'Иркутская область', 'Приморский край', 'Камчатский край', 'Свердловская область', 'Новосибирская область', 'Красноярский край'].includes(name));
  for (const name of east) assert.notEqual(regionTimezone(name), 'Europe/Moscow', name);
  for (const name of regionNames) assert.equal(isKnownRegion(name), true, name);
});

test('plan status: a registered pupil gets no registration reminders, a finished olympiad none at all', () => {
  const events = [event('registration', 'ends', '2026-10-03'), event('competition', 'starts', '2026-10-02', { name: 'отборочный этап' })];
  const kinds = (status?: ReminderItem['status']) => dueReminders([item(events, { status })], TODAY, { includeEstimated: true }).map(due => due.stageKind);
  assert.deepEqual(kinds(), ['competition', 'registration']);
  assert.deepEqual(kinds('planned'), ['competition', 'registration']);
  assert.deepEqual(kinds('registered'), ['competition']);
  assert.deepEqual(kinds('in_progress'), ['competition']);
  assert.deepEqual(kinds('done'), []);
});

test('date changes: first sight only records, a moved date is announced with the old one, a vanished date is quiet', () => {
  const today = TODAY;
  const before = item([event('registration', 'ends', '2026-10-04'), event('competition', 'day', '2026-11-15', { name: 'отборочный этап' })]);
  const snapshot = eventsSnapshot(before, today, { includeEstimated: true });
  assert.deepEqual(snapshot, ['competition:day:2026-11-15', 'registration:ends:2026-10-04']);
  assert.equal(scheduleChange(before, snapshot, today, { includeEstimated: true }), null, 'nothing changed');

  const moved = item([event('registration', 'ends', '2026-10-12'), event('competition', 'day', '2026-11-15', { name: 'отборочный этап' })]);
  const change = scheduleChange(moved, snapshot, today, { includeEstimated: true });
  assert.deepEqual(change?.events.map(e => [e.eventKey, e.previousDate]), [['registration:ends:2026-10-12', '2026-10-04']]);
  assert.deepEqual(change?.snapshot, ['competition:day:2026-11-15', 'registration:ends:2026-10-12']);
  assert.match(reminderText([], { changes: [change!] }), /Изменились сроки олимпиад из вашего плана[\s\S]*Регистрация закрывается через 11 дней — 12 октября, пн \(было 4 октября\)/);

  const vanished = scheduleChange(item([event('competition', 'day', '2026-11-15')]), snapshot, today, { includeEstimated: true });
  assert.deepEqual(vanished?.events, [], 'a vanished date updates the snapshot without a message');
  assert.equal(scheduleChange(item([]), snapshot, today, { includeEstimated: true }), null, 'all dates gone at once — an empty import, keep the snapshot');
  assert.equal(scheduleChange(moved, ['registration:ends:2026-09-28', ...snapshot.slice(0, 1)], today, { includeEstimated: true })?.events[0]?.previousDate, '2026-09-28',
    'a deadline extended after it passed is still a move');
  assert.equal(scheduleChange(moved, ['registration:ends:2026-08-20', ...snapshot.slice(0, 1)], today, { includeEstimated: true })?.events[0]?.previousDate, null,
    'a long-past date is history: the new one is a new round');
  assert.equal(scheduleChange(item([event('competition', 'day', '2026-11-15')]), ['competition:day:2026-11-15', 'registration:ends:2026-09-20'], today, { includeEstimated: true }), null,
    'dates simply passing change nothing');
  assert.equal(scheduleChange({ ...moved, tracking: false }, snapshot, today, { includeEstimated: true }), null);
  assert.deepEqual(eventsSnapshot({ ...before, status: 'registered' }, today, { includeEstimated: true }), ['competition:day:2026-11-15'],
    'after registration, registration dates no longer matter');
});

test('a moved date that is due today is said once, in the reminder line', () => {
  const moved = item([event('registration', 'ends', '2026-10-04')]);
  const change = scheduleChange(moved, ['registration:ends:2026-10-20'], TODAY, { includeEstimated: true })!;
  const text = reminderText(dueReminders([moved], TODAY, { includeEstimated: true }), { changes: [change] });
  assert.match(text, /Регистрация закрывается через 3 дня — 4 октября, вс \(было 20 октября\)/);
  assert.doesNotMatch(text, /Изменились сроки/);
});

test('bot companion: free text opens the app with the text in the search or in Olimp\'s chat', () => {
  const identity = { username: 'olimp_bot', userId: 42 };
  const decode = (payload: string) => Buffer.from(payload.replace(/^(ask|search)_/, ''), 'base64url').toString('utf8');
  assert.match(startParam.search('олимпиады по химии'), /^search_[A-Za-z0-9_-]+$/);
  assert.equal(decode(startParam.search('олимпиады по химии')), 'олимпиады по химии');
  assert.ok(startParam.ask('а'.repeat(400)).length <= 512, 'MAX takes up to 512 characters');

  const search = fallbackMessage(identity, 'физтех').keyboard!.payload.buttons;
  assert.deepEqual(search.slice(0, 2).map(row => [row[0]!.text, decode(payloadOf(row[0])!)]), [['🔎 Найти в каталоге', 'физтех'], ['💬 Спросить Олимпа', 'физтех']]);
  const question = fallbackMessage(identity, 'Какие льготы даёт Высшая проба в ВШЭ?').keyboard!.payload.buttons;
  assert.equal(question[0]![0]!.text, '💬 Спросить Олимпа', 'a question goes to Olimp first');
  assert.equal(payloadOf(fallbackMessage(identity, '/unknown').keyboard!.payload.buttons[0]![0]), 'olimp', 'unknown commands get the plain hint');
  assert.equal(payloadOf(fallbackMessage(identity).keyboard!.payload.buttons[0]![0]), 'olimp');
});

test('bot start links and the «registered» button texts', () => {
  assert.deepEqual(parseStartPayload('notify'), { kind: 'notify' });
  assert.deepEqual(parseStartPayload('olympiad_88'), { kind: 'olympiad', id: 88 });
  for (const value of [null, undefined, '', 'olympiad_0', 'something']) assert.deepEqual(parseStartPayload(value), { kind: 'plain' });
  const identity = { username: 'olimp_bot', userId: 42 };
  const base = { firstName: 'Аня', registered: true, enabled: true, schedule: { hour: 16, localTime: true } };
  assert.match(welcomeMessage(identity, { ...base, reason: { kind: 'notify' } }).text, /Бот подключён/);
  assert.match(welcomeMessage(identity, base).text, /после 16:00 по вашему времени/);
  assert.match(welcomeMessage(identity, { ...base, schedule: { hour: 16, localTime: false } }).text, /по Москве\. Укажите регион/);
  const link = welcomeMessage(identity, { ...base, reason: { kind: 'olympiad', id: 88, title: 'Высшая проба' } });
  assert.equal(payloadOf(link.keyboard!.payload.buttons[0]![0]), 'olympiad_88');
  assert.equal(registeredNotice({ status: 'registered', changed: true }), 'Отметил: вы зарегистрированы');
  assert.equal(registeredNotice({ status: 'in_progress', changed: false }), 'В плане уже стоит статус «участвую»');
  assert.equal(registeredNotice(null), 'Этой олимпиады уже нет в вашем плане');
});
