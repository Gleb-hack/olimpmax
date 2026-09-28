import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventLabel, eventTiming, type PlanCardEvent } from '../src/features/plan/plan-card-format.ts';
import { stageCountdown } from '../src/lib/format.ts';
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

test('stage countdown counts Moscow calendar days and disappears once the stage has started', () => {
  const upcomingStage = { name: 'Муниципальный этап', kind: 'competition' as const, event: 'starts' as const, date: '2026-11-02', estimated: true };
  const countdown = stageCountdown({ upcomingStage }, '2026-09-28')!;
  assert.equal(countdown.value, '35 дней');
  assert.equal(countdown.text, 'до этапа «Муниципальный этап»');
  assert.equal(countdown.estimated, true);
  assert.equal(stageCountdown({ upcomingStage }, '2026-11-01')!.value, '1 день');
  assert.equal(stageCountdown({ upcomingStage }, '2026-10-31')!.value, '2 дня');
  assert.deepEqual([stageCountdown({ upcomingStage }, '2026-11-02')!.value, stageCountdown({ upcomingStage }, '2026-11-02')!.text], ['Сегодня', 'начинается этап «Муниципальный этап»']);
  assert.equal(stageCountdown({ upcomingStage }, '2026-11-03'), null);
  assert.equal(stageCountdown({ upcomingStage: null }, '2026-09-28'), null);
  assert.equal(stageCountdown({ upcomingStage: { ...upcomingStage, name: 'Регистрация', kind: 'registration' } }, '2026-09-28')!.text, 'до начала регистрации');
  assert.equal(stageCountdown({ upcomingStage: { ...upcomingStage, name: null } }, '2026-09-28')!.text, 'до следующего этапа');
  assert.equal(countdown.label, 'До следующего этапа');
  assert.equal(countdown.hint, 'Начало — 2 нояб. 2026 г.');
});

test('a running stage or a deadline counts to its end', () => {
  const upcomingStage = { name: 'Отборочный этап, 1 тур', kind: 'competition' as const, event: 'ends' as const, date: '2026-10-11', estimated: true };
  const countdown = stageCountdown({ upcomingStage }, '2026-09-28')!;
  assert.deepEqual([countdown.value, countdown.text, countdown.label, countdown.stage], ['13 дней', 'до конца этапа «Отборочный этап, 1 тур»', 'До конца этапа', 'Отборочный этап, 1 тур']);
  assert.equal(countdown.hint, 'Окончание — 11 окт. 2026 г.');
  assert.equal(stageCountdown({ upcomingStage }, '2026-10-11')!.text, 'последний день этапа «Отборочный этап, 1 тур»');
  const registration = stageCountdown({ upcomingStage: { ...upcomingStage, name: 'Регистрация', kind: 'registration' } }, '2026-10-01')!;
  assert.deepEqual([registration.value, registration.text, registration.label], ['10 дней', 'до конца регистрации', 'До конца регистрации']);
});
