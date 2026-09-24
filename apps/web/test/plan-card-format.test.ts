import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventLabel, eventTiming, type PlanCardEvent } from '../src/features/plan/plan-card-format.ts';
import { OlympiadDetail } from '@olimp/contracts';
import details from '../src/lib/mock-details.json';

test('plan countdown uses calendar days and limits urgency to the next three days', () => {
  assert.deepEqual(eventTiming('2026-10-01', '2026-09-30'), { relative: 'через 1 день', urgency: 'остался 1 день' });
  assert.deepEqual(eventTiming('2026-10-03', '2026-09-30'), { relative: 'через 3 дня', urgency: 'осталось 3 дня' });
  assert.deepEqual(eventTiming('2026-10-04', '2026-09-30'), { relative: 'через 4 дня', urgency: null });
  assert.deepEqual(eventTiming('2026-09-30', '2026-09-30'), { relative: 'сегодня', urgency: 'сегодня' });
  assert.deepEqual(eventTiming('2026-09-29', '2026-09-30'), { relative: '1 день назад', urgency: null });
  assert.equal(eventTiming('2026-10-21', '2026-09-30').relative, 'через 21 день');
  assert.equal(eventTiming('2028-03-01', '2028-02-28').relative, 'через 2 дня');
});

test('plan does not label competition dates as registration deadlines', () => {
  const detail = OlympiadDetail.parse(details[0]);
  const stage = detail.stages[0]!;
  const event: PlanCardEvent = { stageId: stage.id, name: stage.name, date: '2026-10-01', kind: 'ends', timezone: 'Europe/Moscow', sourceUrl: detail.sourceUrl };
  assert.equal(eventLabel({ stages: [{ ...stage, kind: 'competition' }] }, event), 'Окончание этапа');
  assert.equal(eventLabel({ stages: [{ ...stage, kind: 'registration' }] }, event), 'Дедлайн регистрации');
  assert.equal(eventLabel({ stages: [{ ...stage, kind: 'registration' }] }, { ...event, kind: 'starts' }), 'Начало регистрации');
  assert.equal(eventLabel({ stages: [] }, event), 'Окончание этапа');
});
