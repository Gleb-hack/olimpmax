import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OlympiadProgramsResponse } from '@olimp/contracts';
import { coverageText } from '../src/features/catalog/detail-format.ts';
import { programRows } from '../src/features/catalog/program-format.ts';

test('coverage: a fact from the rules, an estimate by the exams, nothing when unknown', () => {
  assert.equal(coverageText({ matched: 13, total: 28, source: 'exams' }), 'Подходит к ≈13 из 28 направлений');
  assert.equal(coverageText({ matched: 5, total: 21, source: 'rules' }), 'Подходит к 5 из 21 направления');
  assert.equal(coverageText(null), null);
  assert.equal(coverageText(undefined), null);
  assert.equal(coverageText({ matched: 0, total: 0, source: 'exams' }), null);
});

const program = (id: number, name: string, examMatch: boolean, passingScore: number | null = 290) => ({
  id, name, faculty: null, examsRequired: ['Русский язык', 'Математика', 'Информатика'], examsChoice: [], internalExam: false,
  passingScore, passingScoreForm: 'очно', passingYear: 2025, funding: 'budget' as const, sourceUrl: 'https://tabiturient.ru/vuzu/hse/proxodnoi/',
  direction: { code: '09.03.04', name: 'Программная инженерия', educationLevel: 'bachelor' as const }, viaRsosh: false, subjectRelevance: 'core' as const, examMatch,
});

test('programs: the exam match first, the direction as the title of a program without its own name', () => {
  const response = OlympiadProgramsResponse.parse({ applicable: true, note: null, items: [
    { university: { slug: 'itmo', name: 'ИТМО', city: 'Санкт-Петербург' }, coverage: null,
      benefits: [{ kind: 'bvi', diploma: 'any', minScore: 75, maxScore: null, requirement: null }],
      programs: [program(1, 'Разработка игр', false, null)] },
    { university: { slug: 'hse', name: 'НИУ ВШЭ', city: 'Москва' }, coverage: null,
      benefits: [{ kind: 'bvi', diploma: 'any', minScore: 75, maxScore: null, requirement: null }, { kind: 'score_100', diploma: 'winner', minScore: 75, maxScore: null, requirement: null }],
      programs: [program(338, 'Без профиля', true, 297)] },
  ] });
  const rows = programRows(response);
  assert.deepEqual(rows.map(r => [r.title, r.subtitle, r.score, r.examMatch]), [
    ['Программная инженерия', 'НИУ ВШЭ · БВИ · 100 баллов ЕГЭ победителям', 'Проходной 297 в 2025', true],
    ['Разработка игр', 'ИТМО · Программная инженерия · БВИ', null, false],
  ]);
});
