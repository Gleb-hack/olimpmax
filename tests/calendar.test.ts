import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stageEvents, calendarSummary, moscowToday, addDays } from '../apps/api/src/features/calendar.js';
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
