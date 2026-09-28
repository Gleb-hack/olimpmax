import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayKey, monthGrid, monthTitle, planCalendarItems, shiftMonth, soonCount, visibleItems } from '../src/features/plan/calendar-model.ts';
import { isOrganizer, universityBenefits, universityInitials } from '../src/features/catalog/detail-format.ts';
import type { PlanEntry } from '../src/lib/api.ts';

test('month grid starts on Monday and pads neighbouring days', () => {
  const may = monthGrid({ year: 2026, month: 5 }); // 1 May 2026 is a Friday, as in the Figma frame
  assert.deepEqual(may[0], [null, null, null, null, 1, 2, 3]);
  assert.deepEqual(may.at(-1), [25, 26, 27, 28, 29, 30, 31]);
  assert.equal(monthGrid({ year: 2026, month: 2 }).flat().filter(Boolean).length, 28);
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2027, month: 1 }, -1), { year: 2026, month: 12 });
  assert.equal(monthTitle({ year: 2026, month: 9 }), 'Сентябрь 2026');
  assert.equal(dayKey({ year: 2026, month: 11 }, 2), '2026-11-02');
});

const entry = (id: number, title: string, tracking: boolean, events: NonNullable<PlanEntry['calendarEvents']>) =>
  ({ olympiad: { id, title }, tracking, calendarEvents: events }) as unknown as PlanEntry;
const event = (kind: 'starts' | 'ends' | 'day', date: string, stageKind: 'registration' | 'competition' = 'competition', name = 'Муниципальный этап') =>
  ({ stageId: '123e4567-e89b-42d3-a456-426614174000', name, stageKind, kind, date, estimated: true });

test('calendar lists tracked olympiads only, with readable labels, and filters by month or day', () => {
  const items = planCalendarItems([
    entry(88, 'ВсОШ по английскому', true, [event('ends', '2026-11-01', 'registration', 'Регистрация'), event('starts', '2026-11-02'), event('ends', '2026-12-25')]),
    entry(5, 'На паузе', false, [event('day', '2026-11-03')]),
  ]);
  assert.deepEqual(items.map(i => [i.date, i.tone, i.label]), [
    ['2026-11-01', 'registration', 'Конец регистрации'], ['2026-11-02', 'competition', 'Муниципальный этап: начало'], ['2026-12-25', 'competition', 'Муниципальный этап: окончание']]);
  const november = visibleItems(items, { year: 2026, month: 11 }, '2026-11-01', null);
  assert.equal(november.heading, 'Ближайшие события'); assert.equal(november.items.length, 2);
  assert.equal(visibleItems(items, { year: 2026, month: 11 }, '2026-11-02', null).items.length, 1);
  const day = visibleItems(items, { year: 2026, month: 11 }, '2026-09-28', '2026-11-02');
  assert.equal(day.heading, 'События 2 ноября'); assert.deepEqual(day.items.map(i => i.label), ['Муниципальный этап: начало']);
  assert.equal(visibleItems(items, { year: 2026, month: 11 }, '2026-12-10', null).heading, 'События месяца');
  const entries = [entry(88, 'ВсОШ', true, [event('starts', '2026-11-02')]), entry(5, 'На паузе', false, [event('day', '2026-10-01')])];
  assert.equal(soonCount(entries, '2026-10-25'), 1); assert.equal(soonCount(entries, '2026-09-28'), 0);
});

test('«Вузы с льготами»: one card per university, БВИ first, initials like the Figma avatar', () => {
  assert.equal(universityInitials('МФТИ'), 'МФ');
  assert.equal(universityInitials('НИУ ВШЭ'), 'ВШ');
  assert.equal(universityInitials('МГТУ им. Н.Э. Баумана'), 'МГ');
  assert.equal(universityInitials('Финансовый университет'), 'ФУ');
  const mipt = { slug: 'mipt', name: 'МФТИ', city: 'Долгопрудный' };
  const groups = universityBenefits([
    { university: mipt, kind: 'score_100', diploma: 'any', minScore: 75, maxScore: null, requirement: 'ЕГЭ по профильному предмету от 75 баллов' },
    { university: mipt, kind: 'bvi', diploma: 'winner', minScore: 75, maxScore: 85, requirement: 'ЕГЭ по профильному предмету от 75 до 85 баллов' },
    { university: { slug: 'hse', name: 'НИУ ВШЭ', city: 'Москва' }, kind: 'bvi', diploma: 'any', minScore: null, maxScore: null, requirement: 'Подтверждать баллами ЕГЭ не нужно' },
  ]);
  assert.deepEqual(groups.map(g => [g.name, g.initials, g.summary]), [['МФТИ', 'МФ', 'БВИ победителям · 100 баллов ЕГЭ'], ['НИУ ВШЭ', 'ВШ', 'БВИ']]);
  assert.equal(groups[0]!.lines[0]!.requirement, 'Подтвердить: ЕГЭ по профильному предмету от 75 до 85 баллов');
  assert.equal(groups[1]!.lines[0]!.requirement, 'Подтверждать баллами ЕГЭ не нужно');
});

test('the organizing university is recognized by short or full name and goes first', () => {
  const mipt = { slug: 'mipt', name: 'МФТИ', city: 'Долгопрудный', fullName: 'Московский физико-технический институт (национальный исследовательский университет)' };
  const mgimo = { slug: 'mgimo', name: 'МГИМО', city: 'Москва', fullName: 'Московский государственный институт международных отношений (университет) МИД России' };
  const ranepa = { slug: 'ranepa', name: 'РАНХиГС', city: 'Москва', fullName: 'Российская академия народного хозяйства и государственной службы при Президенте Российской Федерации' };
  assert.equal(isOrganizer(mipt, ['Московский физико-технический институт', 'Департамент образования и науки города Москвы']), true);
  assert.equal(isOrganizer(mgimo, ['МГИМО (У) МИД России']), true);
  assert.equal(isOrganizer(ranepa, ['Российская академия народного хозяйства и государственной службы при президенте РФ']), true);
  assert.equal(isOrganizer(mgimo, ['Московский физико-технический институт']), false);
  const groups = universityBenefits([
    { university: { slug: 'itmo', name: 'ИТМО', city: 'Санкт-Петербург', fullName: 'Национальный исследовательский университет ИТМО' }, kind: 'bvi', diploma: 'any', minScore: 75, maxScore: null, requirement: 'x' },
    { university: mipt, kind: 'bvi', diploma: 'any', minScore: 75, maxScore: null, requirement: 'x' },
  ], ['Московский физико-технический институт']);
  assert.deepEqual(groups.map(g => [g.name, g.organizer]), [['МФТИ', true], ['ИТМО', false]]);
});
