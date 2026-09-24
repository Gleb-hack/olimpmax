import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { z } from 'zod';
import { OlympiadCard, OlympiadDetail, type Stage } from '@olimp/contracts';
import details from '../src/lib/mock-details.json';
import { registrationDeadline, stageSummary } from '../src/features/catalog/detail-format.ts';

const stage = (patch: Partial<z.infer<typeof Stage>> = {}): z.infer<typeof Stage> => ({
  id: '00000000-0000-4000-8000-000000000001', name: 'Регистрация', kind: 'registration', rawDates: 'До 1 ноя',
  beginsOn: null, endsOn: '2026-11-01', timezone: 'Europe/Moscow', verification: 'verified',
  sourceUrl: 'https://example.com/schedule', verifiedAt: '2026-09-23T00:00:00Z', origin: 'verified_import', ...patch,
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
  assert.equal(stageSummary([]), 'Этапы уточняются');
  assert.equal(stageSummary([stage()]), 'Этапы уточняются');
  assert.equal(stageSummary([stage({ kind: 'competition', name: 'Очный тур' })]), 'Очный тур');
});

test('catalog carries actual organizers and accepts responses from the previous API', () => {
  const detail = OlympiadDetail.parse(details[0]);
  const card = OlympiadCard.parse(detail);
  assert.deepEqual(card.organizers, detail.organizers);
  const { organizers: _, ...previous } = card;
  assert.ok(OlympiadCard.safeParse(previous).success);
});
