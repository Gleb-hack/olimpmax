import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultResultStage, hiddenStagesLabel, planSchedule, scheduleStageHint, scheduleWindow } from '../src/features/plan/plan-card-format.ts';
import type { PlanEntry } from '../src/lib/api.ts';

type Event = NonNullable<PlanEntry['calendarEvents']>[number];
const event = (stageId: string, name: string | null, date: string, kind: Event['kind'] = 'day', stageKind: Event['stageKind'] = 'competition', estimated = false): Event =>
  ({ stageId, name, date, kind, stageKind, estimated });

test('the schedule joins the start and end of a stage, sorts by date and marks the first unfinished stage as the nearest', () => {
  const schedule = planSchedule({ calendarEvents: [
    event('f', 'Финал', '2027-02-15'),
    event('o2', 'Отбор 2', '2026-10-05', 'starts'), event('o2', 'Отбор 2', '2026-10-12', 'ends'),
    event('r', null, '2026-09-01', 'ends', 'registration'),
    event('o1', 'Отбор 1, тур 1', '2026-09-20'),
  ] }, '2026-10-02');
  assert.deepEqual(schedule.map(stage => [stage.number, stage.name, stage.start, stage.end, stage.state]), [
    [1, 'Регистрация', '2026-09-01', '2026-09-01', 'past'],
    [2, 'Отбор 1, тур 1', '2026-09-20', '2026-09-20', 'past'],
    [3, 'Отбор 2', '2026-10-05', '2026-10-12', 'next'],
    [4, 'Финал', '2027-02-15', '2027-02-15', 'future'],
  ]);
  assert.deepEqual(planSchedule({ calendarEvents: [event('a', 'A', '2026-01-01')] }, '2026-10-02').map(stage => stage.state), ['past']);
  assert.deepEqual(planSchedule({}, '2026-10-02'), []);
});

test('a long schedule shows the stage before the nearest one, the nearest one and the one after it', () => {
  const stages = ['past', 'past', 'next', 'future', 'future', 'future'].map(state => ({ state }) as { state: 'past' | 'next' | 'future' });
  const window = scheduleWindow(stages);
  assert.deepEqual([window.before, window.items.length, window.after], [1, 3, 2]);
  assert.deepEqual([scheduleWindow(stages, { before: true, after: false }).before, scheduleWindow(stages, { before: true, after: true }).items.length], [0, 6]);
  const allPast = stages.map(() => ({ state: 'past' as const }));
  assert.deepEqual([scheduleWindow(allPast).before, scheduleWindow(allPast).after], [3, 0]);
  const first = [{ state: 'next' as const }, ...stages.slice(3)];
  assert.deepEqual([scheduleWindow(first).before, scheduleWindow(first).after], [0, 1]);
  assert.deepEqual(scheduleWindow(stages.slice(0, 3)).items.length, 3);
});

test('collapsed stages and row hints read naturally in Russian', () => {
  assert.equal(hiddenStagesLabel(1, 'before'), 'Ещё 1 этап пройден');
  assert.equal(hiddenStagesLabel(2, 'before'), 'Ещё 2 этапа пройдены');
  assert.equal(hiddenStagesLabel(5, 'before'), 'Ещё 5 этапов пройдено');
  assert.equal(hiddenStagesLabel(2, 'after'), 'Ещё 2 этапа впереди');
  const today = '2026-05-14';
  assert.deepEqual(scheduleStageHint({ start: '2026-05-10', end: '2026-05-10', state: 'past', estimated: false }, today), { text: 'Дата прошла', day: '2026-05-10' });
  assert.deepEqual(scheduleStageHint({ start: '2026-05-17', end: '2026-05-17', state: 'next', estimated: false }, today), { text: 'Ближайший · через 3 дня', day: '2026-05-17' });
  assert.deepEqual(scheduleStageHint({ start: '2026-05-12', end: '2026-05-20', state: 'next', estimated: false }, today), { text: 'Идёт сейчас · до 20 мая', day: '2026-05-20' });
  assert.equal(scheduleStageHint({ start: '2026-06-02', end: '2026-06-02', state: 'future', estimated: false }, today).text, '2 июня');
  assert.equal(scheduleStageHint({ start: '2026-06-02', end: '2026-06-10', state: 'future', estimated: true }, today).text, '2–10 июня · ориентировочно');
  assert.equal(scheduleStageHint({ start: '2026-06-28', end: '2026-07-03', state: 'future', estimated: false }, today).text, '28 июня – 3 июля');
});

test('a new result defaults to the latest stage that has started and has no result yet', () => {
  const schedule = [{ name: 'Отбор 1', start: '2026-09-01' }, { name: 'Отбор 2', start: '2026-10-01' }, { name: 'Финал', start: '2027-02-01' }];
  assert.equal(defaultResultStage(['Отбор 1', 'Отбор 2', 'Финал'], schedule, '2026-10-05'), 'Отбор 2');
  assert.equal(defaultResultStage(['Отбор 1', 'Финал'], schedule, '2026-10-05'), 'Отбор 1');
  assert.equal(defaultResultStage(['Финал'], schedule, '2026-10-05'), 'Финал');
  assert.equal(defaultResultStage([], schedule, '2026-10-05'), undefined);
});
