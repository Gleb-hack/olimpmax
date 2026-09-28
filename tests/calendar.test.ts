import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stageEvents, calendarSummary, moscowToday, addDays, upcomingStage, anchorDay, scheduleEvents } from '../apps/api/src/features/calendar.js';
import { Stage, VerifiedStagesFile, CatalogQuery } from '../packages/contracts/src/index.js';
const stage = Stage.parse({ id: randomUUID(), name: 'Отборочный этап', kind: 'competition',
  rawDates: null, beginsOn: '2026-09-20', endsOn: '2026-09-22', timezone: 'Europe/Moscow',
  verification: 'verified', sourceUrl: 'https://example.org/schedule', verifiedAt: '2026-09-20T09:00:00Z', origin: 'verified_import' });
test('current stage gives its deadline; today is included and yesterday is excluded', () => {
  assert.deepEqual(stageEvents([stage], '2026-09-22').map(s => [s.kind, s.date]), [['ends', '2026-09-22']]);
  assert.deepEqual(stageEvents([stage], '2026-09-23'), []);
  assert.equal(calendarSummary([stage], 'published', '2026-09-23').calendarState, 'no_upcoming');
});
test('unverified, stale and not-held schedules cannot become next events', () => {
  assert.deepEqual(stageEvents([{ ...stage, verification: 'unverified' }], '2026-09-22'), []);
  assert.deepEqual(stageEvents([{ ...stage, verification: 'needs_review' }], '2026-09-22'), []);
  assert.equal(calendarSummary([stage], 'not_held', '2026-09-22').nextEvent, null);
  assert.equal(calendarSummary([], 'unknown', '2026-09-22').calendarState, 'unknown');
});
test('Moscow day boundary, year boundary and leap-year arithmetic', () => {
  assert.equal(moscowToday(new Date('2026-09-21T21:00:00Z')), '2026-09-22');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('contracts reject invalid dates, impossible order, unsupported filters and excessive pages', () => {
  const valid = { olympiadId: 88, key: 'test', name: 'test', kind: 'competition', beginsOn: '2026-10-01', endsOn: '2026-10-02', sourceUrl: 'https://example.org', verifiedAt: '2026-09-22T00:00:00Z', verifiedBy: 'Тест' };
  assert.equal(VerifiedStagesFile.safeParse([valid]).success, true);
  assert.equal(VerifiedStagesFile.safeParse([{ ...valid, beginsOn: '2026-02-30' }]).success, false);
  assert.equal(VerifiedStagesFile.safeParse([{ ...valid, beginsOn: '2026-10-03' }]).success, false);
  assert.equal(CatalogQuery.safeParse({ grades: '12' }).success, false);
  assert.equal(CatalogQuery.safeParse({ pageSize: 10001 }).success, false);
  assert.equal(CatalogQuery.safeParse({ unknown: 'x' }).success, false);
  assert.deepEqual(CatalogQuery.parse({ grades: '8,9' }).grades, [8, 9]);
});

const csv = (name: string | null, rawDates: string | null, kind: 'registration' | 'competition' | 'other' = 'competition', origin: 'csv' | 'reference' = 'csv') =>
  Stage.parse({ id: randomUUID(), name, kind, rawDates, beginsOn: null, endsOn: null, timezone: 'Europe/Moscow', verification: 'unverified', sourceUrl: null, verifiedAt: null, origin });
const next = (stages: ReturnType<typeof csv>[], options: Partial<Parameters<typeof upcomingStage>[1]> = {}) =>
  upcomingStage(stages, { scheduleSource: 'catalog', statusRaw: 'Этап запланирован', calendarState: 'unverified', anchor: '2026-09-24', today: '2026-09-28', ...options });

test('next stage: the earliest stage that has not started, year taken from the season of the checked schedule', () => {
  // ВсОШ: the school stage is running (only a deadline), the municipal one starts on 2 November.
  assert.deepEqual(next([csv('Школьный этап', 'До 1 ноя'), csv('Муниципальный этап', '2 ноя—25 дек')]),
    { name: 'Муниципальный этап', kind: 'competition', startsOn: '2026-11-02', estimated: true });
  // January–July belong to the next calendar year of the 2026/27 season; single days are one-day stages.
  assert.equal(next([csv('Отборочный этап', 'до 12 января'), csv('Финал', '14 февраля')])!.startsOn, '2027-02-14');
  assert.equal(next([csv('Отборочный этап', '15 окт—10 дек'), csv('Финал', '3 апр')])!.startsOn, '2026-10-15');
  // A stage starting today still counts; one that started yesterday does not.
  assert.equal(next([csv('Первый тур', '28 сен')])!.startsOn, '2026-09-28');
  assert.equal(next([csv('Первый тур', '27 сен')]), null);
  assert.equal(next([csv('Регистрация', '1 окт—1 дек', 'registration')])!.kind, 'registration');
  // An explicit year is kept and not marked as estimated.
  assert.deepEqual(next([csv('Финал', '16 декабря 2026 — 20 января 2027')]), { name: 'Финал', kind: 'competition', startsOn: '2026-12-16', estimated: false });
});

test('next stage is not guessed from closed cycles, month-only texts, other schedules or not-held olympiads', () => {
  assert.equal(next([csv('XVI олимпиада', '11—17 апр')], { statusRaw: 'Следующий цикл ожидается' }), null);
  assert.equal(next([csv('Финал', '6 мар')], { statusRaw: 'Итоги опубликованы' }), null);
  assert.equal(next([csv('Следующее соревнование', 'Следующее соревнование начнется в ноябре 2026 года')]), null);
  assert.equal(next([csv('Регистрация', 'До 21 окт', 'registration')]), null);
  assert.equal(next([csv('Финал', '6 мар')], { calendarState: 'not_held' }), null);
  // The card shows the reference schedule: olimpiada.ru stages are ignored and vice versa.
  const reference = csv('Заключительный этап', '22-24 декабря', 'competition', 'reference');
  assert.equal(next([csv('Финал', '6 мар'), reference], { scheduleSource: 'reference', statusRaw: 'Следующий цикл ожидается' })!.startsOn, '2026-12-22');
  assert.equal(next([reference])?.startsOn, undefined);
  // Verified stages keep exact dates.
  assert.deepEqual(next([{ ...stage, beginsOn: '2026-10-05', endsOn: '2026-10-06' }]), { name: 'Отборочный этап', kind: 'competition', startsOn: '2026-10-05', estimated: false });
});

test('paired «Дополнительная дата» lines keep the stage title; the anchor comes from the export check date', () => {
  const stages = [csv('Дополнительная дата', 'Школьный тур для 7-11 классов'), csv('Дополнительная дата', '1—19 сен'),
    csv('Дополнительная дата', 'Муниципальный тур для 7-11 классов'), csv('Дополнительная дата', '3—21 окт')];
  assert.equal(next(stages)!.name, 'Муниципальный тур для 7-11 классов');
  assert.equal(anchorDay('24.09.2026', '2027-01-10T00:00:00Z'), '2026-09-24');
  assert.equal(anchorDay(undefined, '2026-09-27T22:30:00Z'), '2026-09-28');
  // A schedule checked in spring belongs to the season that started the previous August.
  assert.equal(next([csv('Финал', '6 мар')], { anchor: '2027-03-01', today: '2027-03-01' })!.startsOn, '2027-03-06');
});

test('plan calendar: starts and ends of ranges, deadlines and one-day stages, with the season year', () => {
  const events = (stages: ReturnType<typeof csv>[], options: Partial<Parameters<typeof scheduleEvents>[1]> = {}) =>
    scheduleEvents(stages, { scheduleSource: 'catalog', statusRaw: 'Этап запланирован', calendarState: 'unverified', anchor: '2026-09-24', ...options })
      .map(e => [e.name, e.stageKind, e.kind, e.date, e.estimated]);
  assert.deepEqual(events([csv('Регистрация', 'До 30 ноя', 'registration'), csv('Отборочный этап', '1—2 дек'), csv('Финал', '14 фев')]), [
    ['Регистрация', 'registration', 'ends', '2026-11-30', true],
    ['Отборочный этап', 'competition', 'starts', '2026-12-01', true], ['Отборочный этап', 'competition', 'ends', '2026-12-02', true],
    ['Финал', 'competition', 'day', '2027-02-14', true]]);
  // Past stages stay: the calendar shows the whole season, not only what is ahead.
  assert.equal(events([csv('Первый тур', '27 сен')])[0]![3], '2026-09-27');
  // A closed cycle gives no guessed dates; an explicit year is kept anyway.
  assert.deepEqual(events([csv('Финал', '6 мар'), csv('Итоги', '16 декабря 2025 — 20 января 2026')], { statusRaw: 'Итоги опубликованы' }).map(e => e[3]), ['2025-12-16', '2026-01-20']);
  assert.deepEqual(events([csv('Финал', '6 мар')], { calendarState: 'not_held' }), []);
  // Verified stages keep exact dates: one day or start and end.
  assert.deepEqual(scheduleEvents([{ ...stage, beginsOn: '2026-10-05', endsOn: '2026-10-05' }], { scheduleSource: 'catalog', statusRaw: '', calendarState: 'verified', anchor: '2026-09-24' })
    .map(e => [e.kind, e.date, e.estimated]), [['day', '2026-10-05', false]]);
});
