import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OlympiadCard, OlympiadDetail } from '@olimp/contracts';
import type { Olympiad, PlanEntry } from '../src/lib/api.ts';
import { dueItems, dueMoment, hasPreferences, morePicks, morePicksQuery, pickRecommendations, recommendationQuery } from '../src/features/assistant/overview-format.ts';
import details from '../src/lib/mock-details.json';

const detail = OlympiadDetail.parse(details[0]);
const card = OlympiadCard.parse(detail);
const stage = detail.stages[0]!;
function entry(id: number, patch: Partial<Olympiad> = {}, extra: Partial<PlanEntry> = {}): PlanEntry {
  return { olympiad: { ...card, id, title: `Олимпиада ${id}`, nextEvent: null, upcomingStage: null, ...patch }, tracking: true, note: null,
    savedAt: '2026-09-01T00:00:00Z', stages: [{ ...stage, kind: 'registration' }], calendarRaw: null, ...extra };
}

test('«Не пропусти» shows the nearest date of each tracked plan olympiad, soonest first', () => {
  const entries = [
    entry(1, { upcomingStage: { name: 'Отборочный этап', kind: 'competition', event: 'starts', date: '2026-10-20', estimated: false } }),
    entry(2),
    entry(3, { upcomingStage: { name: null, kind: 'competition', event: 'starts', date: '2026-10-05', estimated: false } }, { tracking: false }),
  ];
  const events = [{ olympiadId: 2, stageId: stage.id, name: 'Регистрация', date: '2026-10-02', kind: 'ends' as const }];
  assert.deepEqual(dueItems(entries, events, '2026-09-29'), [
    { olympiadId: 2, date: '2026-10-02', month: 'окт', day: '2', title: 'Олимпиада 2', note: 'Осталось 3 дня · дедлайн регистрации', estimated: false },
    { olympiadId: 1, date: '2026-10-20', month: 'окт', day: '20', title: 'Олимпиада 1', note: 'Через 21 день · отборочный этап', estimated: false },
  ]);
});

test('past dates are skipped and dates without a year read «примерно»', () => {
  const entries = [entry(1, {}, { calendarEvents: [
    { stageId: stage.id, name: 'Заключительный этап', stageKind: 'competition', kind: 'day', date: '2026-09-01', estimated: false },
    { stageId: stage.id, name: 'Заключительный этап', stageKind: 'competition', kind: 'day', date: '2027-02-10', estimated: true },
  ] })];
  assert.deepEqual(dueItems(entries, [], '2026-09-29').map(item => item.note), ['Примерно через 134 дня · заключительный этап']);
  assert.deepEqual(dueItems([entry(1)], [], '2026-09-29'), []);
});

test('the moment names registration and stage ends explicitly', () => {
  assert.equal(dueMoment({ name: 'Регистрация', kind: 'starts', stageKind: null }), 'старт регистрации');
  assert.equal(dueMoment({ name: 'Отборочный этап', kind: 'ends', stageKind: 'competition' }), 'завершается отборочный этап');
  assert.equal(dueMoment({ name: null, kind: 'ends', stageKind: 'other' }), 'окончание этапа');
});

test('recommendations use the profile like the assistant does and put new olympiads first', () => {
  assert.equal(recommendationQuery({ grade: 9, subjects: [3, 7], online: true, onsite: false }), 'subjectIds=3%2C7&grades=9&formats=online&sort=complete&pageSize=6');
  assert.equal(recommendationQuery({ grade: null, subjects: [], online: true, onsite: true }), 'sort=complete&pageSize=6');
  assert.equal(hasPreferences({ grade: null, subjects: [], online: true, onsite: true }), false);
  const items = [1, 2, 3, 4].map(id => ({ ...card, id, calendarState: id === 3 ? 'not_held' as const : card.calendarState }));
  assert.deepEqual(pickRecommendations(items, new Set([1])).map(item => item.id), [2, 4]);
  assert.deepEqual(pickRecommendations(items.slice(0, 2), new Set([1])).map(item => item.id), [2, 1]);
});

test('with a goal the selection is ordered by it and matching cards come first', () => {
  assert.equal(recommendationQuery({ grade: 9, subjects: [], online: true, onsite: true, universities: ['hse', 'mipt'], directions: ['09.03.04'] }),
    'grades=9&goalUniversities=hse%2Cmipt&goalDirections=09.03.04&sort=goal&pageSize=6');
  const match = { score: 6, reasons: [{ kind: 'benefit' as const, text: 'БВИ в НИУ ВШЭ' }] };
  const items = [1, 2, 3].map(id => ({ ...card, id, calendarState: 'unverified' as const, goalMatch: id === 1 ? null : match }));
  assert.deepEqual(pickRecommendations(items, new Set([2])).map(item => item.id), [3, 2]);
});

test('«Ещё варианты» keeps the server order and drops shown, repeated and no longer held olympiads', () => {
  const card = (id: number, calendarState = 'unverified') => ({ id, calendarState }) as unknown as Olympiad;
  const items = morePicks([card(1), card(2), card(3, 'not_held'), card(4), card(2), card(5)], new Set([1, 5]));
  assert.deepEqual(items.map(item => item.id), [2, 4]);
  const query = new URLSearchParams(morePicksQuery({ grade: 9, subjects: [8], online: true, onsite: true, universities: ['hse'] }, 3));
  assert.equal(query.get('page'), '3'); assert.equal(query.get('pageSize'), '10');
  assert.equal(query.get('sort'), 'goal'); assert.equal(query.get('goalUniversities'), 'hse'); assert.equal(query.get('grades'), '9');
});
