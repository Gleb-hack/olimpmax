import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { z } from 'zod';
import { OlympiadCard, OlympiadDetail, type Stage } from '@olimp/contracts';
import details from '../src/lib/mock-details.json';
import { registrationDeadline, registrationLabel, stageSummary } from '../src/features/catalog/detail-format.ts';
import { levelLabel, profileGradeLabel, scheduleLabel } from '../src/lib/format.ts';

const stage = (patch: Partial<z.infer<typeof Stage>> = {}): z.infer<typeof Stage> => ({
  id: '00000000-0000-4000-8000-000000000001', name: 'Регистрация', kind: 'registration', rawDates: 'До 1 ноя',
  beginsOn: null, endsOn: '2026-11-01', timezone: 'Europe/Moscow', verification: 'verified',
  sourceUrl: 'https://example.com/schedule', verifiedAt: '2026-09-23T00:00:00Z', origin: 'verified_import', ...patch,
});

test('source schedules and registration text are visible without manufacturing dated events', () => {
  const item = { ...OlympiadDetail.parse(details[0]), calendarState: 'unverified' as const, nextEvent: null,
    calendarRaw: 'Регистрация: До 30 ноя\nОтборочный этап: 1—2 дек',
    stages: [stage({ origin: 'csv', verification: 'unverified', endsOn: null, rawDates: 'До 30 ноя' })] };
  assert.match(scheduleLabel(item), /До 30 ноя/);
  assert.match(registrationLabel(item), /До 30 ноя/);
  assert.equal(registrationDeadline(item), null);
  assert.equal(scheduleLabel({ ...item, calendarState: 'not_held' }), 'Не проводится по данным источника');
  assert.equal(registrationLabel({ ...item, stages: [stage({ kind: 'competition' })] }), 'В расписании не указан');
});

test('level labels preserve draft status, distinguish ВсОШ and do not infer a missing level', () => {
  assert.equal(levelLabel({ level: 'III', levelStatus: 'Проект РСОШ 2026/27; не утвержден на 24.09.2026' }), 'III уровень · проект РСОШ 2026/27');
  assert.equal(levelLabel({ level: 'ВсОШ' }), 'ВсОШ');
  assert.equal(levelLabel({ level: '—' }), 'Не указан');
  assert.equal(levelLabel({}), 'Не указан');
});

test('registration deadline excludes unverified, outdated and competition dates', () => {
  const item = { calendarState: 'verified' as const, stages: [stage({ verification: 'unverified', endsOn: '2026-09-24' }), stage({ endsOn: '2026-09-22' }), stage({ kind: 'competition', endsOn: '2026-09-25' }), stage(), stage({ endsOn: '2026-10-01' })] };
  assert.equal(registrationDeadline(item, '2026-09-23'), '2026-10-01');
  assert.equal(registrationDeadline({ ...item, calendarState: 'not_held' }, '2026-09-23'), null);
  assert.equal(registrationDeadline({ ...item, calendarState: 'needs_review' }, '2026-09-23'), null);
  assert.equal(registrationDeadline({ ...item, stages: [stage({ verification: 'unverified' })] }, '2026-09-23'), null);
  assert.equal(registrationDeadline({ ...item, stages: [stage({ endsOn: '2026-09-23' })] }, '2026-09-23'), '2026-09-23');
});

test('unknown stages are not replaced with fictional qualifying and final rounds', () => {
  assert.equal(stageSummary([]), 'В расписании не указаны');
  assert.equal(stageSummary([stage()]), 'В расписании не указаны');
  assert.equal(stageSummary([stage({ kind: 'competition', name: 'Очный тур' })]), 'Очный тур');
});

test('catalog carries actual organizers and accepts responses from the previous API', () => {
  const detail = OlympiadDetail.parse(details[0]);
  const card = OlympiadCard.parse(detail);
  assert.deepEqual(card.organizers, detail.organizers);
  const { organizers: _, ...previous } = card;
  assert.ok(OlympiadCard.safeParse(previous).success);
});

test('profile grade label is shared by the profile card and the grade chip', () => {
  assert.equal(profileGradeLabel(9), '9 класс');
  assert.equal(profileGradeLabel(null), null);
});
