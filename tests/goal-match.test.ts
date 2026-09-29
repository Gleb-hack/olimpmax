import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalMatch, joinNames, shortUniversityName, type BenefitFact, type DirectionFact } from '../apps/api/src/features/goal-match.js';

const benefit = (slug: string, name: string, kind: BenefitFact['kind'] = 'bvi', diploma: BenefitFact['diploma'] = 'any'): BenefitFact => ({ slug, name, city: 'Москва', kind, diploma });
const direction = (code: string, name: string, viaRsosh: boolean, subjectRelevance: DirectionFact['subjectRelevance'], core: string[] = [], related: string[] = []): DirectionFact =>
  ({ code, name, educationLevel: 'bachelor', viaRsosh, subjectRelevance, core, related });
const pi = (viaRsosh: boolean, relevance: DirectionFact['subjectRelevance']) => direction('09.03.04', 'Программная инженерия', viaRsosh, relevance, ['Информатика', 'Математика'], ['Физика']);

test('four kinds of reasons, strongest first, each with a ready sentence', () => {
  const match = buildGoalMatch({
    inRsoshList: true,
    benefits: [benefit('hse', 'НИУ ВШЭ'), benefit('kazan-fu', 'КФУ')],
    directions: [
      direction('10.05.01', 'Компьютерная безопасность', true, 'core', ['Информатика']),
      pi(false, 'core'),
      direction('11.03.02', 'Инфокоммуникационные технологии и системы связи', false, 'related', ['Физика'], ['Информатика']),
    ],
    subjects: ['Информатика'],
  });
  assert.deepEqual(match?.reasons.map(r => [r.kind, r.text]), [
    ['benefit', 'БВИ в КФУ и НИУ ВШЭ'],
    ['rsosh', 'Профиль по перечню РСОШ подходит для направления «Компьютерная безопасность»'],
    ['core_subject', 'Информатика — профильный предмет для направления «Программная инженерия»'],
    ['related_subject', 'Близкий профиль для направления «Инфокоммуникационные технологии и системы связи» (информатика)'],
  ]);
  assert.equal(match?.score, 6 * 2 + 4 + 3 + 1);
  assert.deepEqual(match?.reasons[0]?.universities?.map(u => u.slug), ['kazan-fu', 'hse']);
  assert.equal(match?.reasons[2]?.subject, 'Информатика');
});

test('a direction is named only in its strongest reason; several directions share one sentence', () => {
  const match = buildGoalMatch({ inRsoshList: true, benefits: [], subjects: ['Информатика', 'Математика'], directions: [
    pi(true, 'core'), direction('01.03.02', 'Прикладная математика и информатика', true, 'core', ['Математика', 'Информатика']),
  ] });
  assert.deepEqual(match?.reasons.map(r => r.text), ['Профиль по перечню РСОШ подходит для направлений «Прикладная математика и информатика» и «Программная инженерия»']);
});

test('БВИ comes before 100 points, a university is not repeated, winners-only is said', () => {
  const match = buildGoalMatch({ inRsoshList: true, directions: [], subjects: [], benefits: [
    benefit('mipt', 'МФТИ', 'score_100'), benefit('msu', 'МГУ им. М.В. Ломоносова', 'bvi', 'winner'), benefit('mipt', 'МФТИ'), benefit('hse', 'НИУ ВШЭ', 'score_100'),
  ] });
  assert.deepEqual(match?.reasons.map(r => r.text), ['БВИ в МФТИ', 'БВИ победителям в МГУ', '100 баллов ЕГЭ в НИУ ВШЭ']);
  assert.equal(match?.score, 6 * 3);
});

test('no benefit for a card outside the RSOSH list; nothing in common gives null', () => {
  assert.equal(buildGoalMatch({ inRsoshList: false, benefits: [benefit('hse', 'НИУ ВШЭ')], directions: [], subjects: [] }), null);
  assert.equal(buildGoalMatch({ inRsoshList: true, benefits: [], directions: [], subjects: ['История'] }), null);
});

test('names read naturally in a sentence', () => {
  assert.equal(shortUniversityName('УрФУ им. Б.Н. Ельцина'), 'УрФУ');
  assert.equal(joinNames(['А', 'Б', 'В']), 'А, Б и В');
  assert.equal(joinNames(['А', 'Б', 'В', 'Г', 'Д']), 'А, Б, В и ещё 2');
});
