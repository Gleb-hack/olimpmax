import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventRelevant, groupByStatus, resultStageOptions } from '../src/features/plan/plan-card-format.ts';
import type { PlanEntry } from '../src/lib/api.ts';

const entry = (id: number, status: PlanEntry['status'], extra: Partial<PlanEntry> = {}) =>
  ({ olympiad: { id }, status, results: [], stages: [], calendarEvents: [], ...extra }) as unknown as PlanEntry;

test('the plan list is grouped by status: taking part, registered, planned, done; empty groups are left out', () => {
  const groups = groupByStatus([entry(1, 'planned'), entry(2, 'done'), entry(3, 'in_progress'), entry(4, 'planned')]);
  assert.deepEqual(groups.map(group => [group.status, group.entries.map(item => item.olympiad.id)]),
    [['in_progress', [3]], ['planned', [1, 4]], ['done', [2]]]);
});

test('result stages come from the schedule without registration, once each, then stages that already have a result', () => {
  const stage = (id: string, kind: 'registration' | 'competition', name: string | null) => ({ id, kind, name }) as PlanEntry['stages'][number];
  const event = (stageId: string, name: string, date: string, stageKind: 'registration' | 'competition' = 'competition') =>
    ({ stageId, name, stageKind, kind: 'day', date, estimated: false }) as NonNullable<PlanEntry['calendarEvents']>[number];
  const options = resultStageOptions(entry(1, 'in_progress', {
    calendarEvents: [event('f', 'Заключительный этап', '2027-02-01'), event('o', 'Отборочный этап', '2026-11-01'), event('r', 'Регистрация', '2026-10-01', 'registration')],
    stages: [stage('o', 'competition', 'отборочный этап'), stage('r', 'registration', 'Регистрация'), stage('n', 'competition', null)],
    results: [{ stage: 'Школьный тур', result: 'passed' }],
  }));
  assert.deepEqual(options, ['Отборочный этап', 'Заключительный этап', 'Школьный тур']);
});

test('upcoming events: registration dates are hidden once registered, a finished olympiad shows none', () => {
  const stages = [{ id: 'r', kind: 'registration' }, { id: 'c', kind: 'competition' }] as PlanEntry['stages'];
  assert.equal(eventRelevant(entry(1, 'planned', { stages }), { stageId: 'r' }), true);
  assert.equal(eventRelevant(entry(1, 'registered', { stages }), { stageId: 'r' }), false);
  assert.equal(eventRelevant(entry(1, 'registered', { stages }), { stageId: 'c' }), true);
  assert.equal(eventRelevant(entry(1, 'done', { stages }), { stageId: 'c' }), false);
});
