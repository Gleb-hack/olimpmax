import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benefitOverview, commonRequirement, seriesInitials, siteLabel, universitySeries } from '../src/features/university/university-format.ts';
import { chatCardDate, chatCardMeta } from '../src/features/assistant/chat-card-format.ts';
import { isOrganizer } from '../src/features/catalog/detail-format.ts';

const benefit = (series: string, name: string, ids: number[], extra: Record<string, unknown> = {}) => ({
  kind: 'bvi' as const, diploma: 'any' as const, minScore: 75, maxScore: null, requirement: 'ЕГЭ от 75 баллов',
  series: { slug: series, name }, olympiadIds: ids, olympiads: ids.map(id => ({ id, title: `${name} ${id}` })), organizers: [] as string[], ...extra,
});
const university = { slug: 'mipt', name: 'МФТИ', city: 'Долгопрудный', fullName: 'Московский физико-технический институт (национальный исследовательский университет)' };

test('series initials follow the Figma avatars', () => {
  assert.equal(seriesInitials('Высшая проба'), 'ВП');
  assert.equal(seriesInitials('Innopolis Open'), 'IO');
  assert.equal(seriesInitials('Олимпиады КФУ'), 'КФУ');
  assert.equal(seriesInitials('ВсОШ по физике'), 'ВсОШ');
  assert.equal(seriesInitials('Олимпиада РАНХиГС'), 'РА');
  assert.equal(seriesInitials('Ломоносов'), 'Ло');
  assert.equal(seriesInitials('Будущие исследователи — будущее науки'), 'БИ');
});

test('university page: the olympiad the user came from first, then own olympiads, БВИ and bigger series', () => {
  const cards = universitySeries({ ...university, benefits: [
    benefit('big', 'Большая', [1, 2, 3]),
    benefit('score', 'Баллы', [4, 5, 6, 7], { kind: 'score_100' }),
    benefit('own', 'Физтех', [8], { organizers: ['Московский физико-технический институт'] }),
    benefit('current', 'Текущая', [9]),
    benefit('big', 'Большая', [1, 2, 3], { kind: 'score_100', diploma: 'winner' }),
  ] }, 9);
  assert.deepEqual(cards.map(card => card.slug), ['current', 'own', 'big', 'score']);
  assert.equal(cards[0]!.current, true);
  assert.equal(cards[1]!.own, true);
  assert.equal(cards[2]!.benefit, 'БВИ · 100 баллов ЕГЭ победителям');
  assert.equal(cards[2]!.olympiads.length, 3);
  assert.equal(benefitOverview(cards), 'БВИ по 3 олимпиадам · 100 баллов ЕГЭ по 2 олимпиадам');
  assert.equal(benefitOverview(cards.slice(0, 1)), 'БВИ по 1 олимпиаде');
  assert.equal(commonRequirement({ benefits: [benefit('a', 'A', [1]), benefit('b', 'B', [2], { requirement: 'Другое' }), benefit('c', 'C', [3])] }), 'ЕГЭ от 75 баллов');
  assert.equal(siteLabel('https://www.hse.ru/'), 'hse.ru');
});

test('generic words of a full name do not make a university the organizer', () => {
  const itmo = { slug: 'itmo', name: 'ИТМО', city: 'Санкт-Петербург', fullName: 'Национальный исследовательский университет ИТМО' };
  const hse = { slug: 'hse', name: 'НИУ ВШЭ', city: 'Москва', fullName: 'Национальный исследовательский университет «Высшая школа экономики»' };
  const organizers = ['Национальный исследовательский университет Высшая школа экономики'];
  assert.equal(isOrganizer(itmo, organizers), false);
  assert.equal(isOrganizer(hse, organizers), true);
});

test('chat card: organizer and the nearest date, the grades when no date is known', () => {
  const card = { organizers: ['СПбГУ'], calendarState: 'unverified' as const, nextEvent: null, gradeFrom: 9, gradeTo: 11, classesRaw: null,
    upcomingStage: { name: 'Отборочный этап', kind: 'competition' as const, startsOn: '2026-10-12', estimated: true } };
  assert.equal(chatCardMeta(card, '2026-09-28'), 'СПбГУ · этап с 12 октября');
  assert.equal(chatCardDate({ ...card, upcomingStage: { ...card.upcomingStage, kind: 'registration' } }, '2026-09-28'), 'регистрация с 12 октября');
  assert.equal(chatCardDate({ ...card, nextEvent: { stageId: '00000000-0000-4000-8000-000000000000', name: null, date: '2027-05-20', kind: 'ends', timezone: 'Europe/Moscow', sourceUrl: 'https://example.org' } }, '2026-09-28'), 'до 20 мая');
  assert.equal(chatCardMeta({ ...card, upcomingStage: null }, '2026-09-28'), 'СПбГУ · 9–11 кл.');
  assert.equal(chatCardMeta({ ...card, organizers: [], calendarState: 'not_held' }, '2026-09-28'), 'не проводится');
});
