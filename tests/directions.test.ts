import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesFieldsOfStudy, matchDirections, examsForSubject, programTakesSubjects, levelFromCode, parseEducationLevel, ugsnCodeOf,
} from '../apps/api/src/reference/directions.js';
import { buildReference, readReferenceDir, checkDirectionSubjects, referenceFiles, type ReferenceInput } from '../apps/api/src/reference/load.js';

const today = '2026-09-29';

test('direction codes carry the level and the group', () => {
  assert.equal(levelFromCode('09.03.04'), 'bachelor');
  assert.equal(levelFromCode('31.05.01'), 'specialist');
  assert.equal(levelFromCode('09.04.01'), null); // магистратура не входит в справочник
  assert.equal(levelFromCode('9.03.04'), null);
  assert.equal(ugsnCodeOf('09.03.04'), '09.00.00');
  assert.equal(parseEducationLevel(' Бакалавриат '), 'bachelor');
  assert.equal(parseEducationLevel('специалитет'), 'specialist');
  assert.equal(parseEducationLevel('магистратура'), null);
});

test('RSOSH fields of study match whole items only, including group names with commas', () => {
  const fields = 'компьютерные и информационные науки, информатика и вычислительная техника, электроника, радиотехника и системы связи, машиностроение';
  assert.ok(matchesFieldsOfStudy(fields, ['Информатика и вычислительная техника']));
  assert.ok(matchesFieldsOfStudy(fields, ['Электроника, радиотехника и системы связи']));
  assert.ok(matchesFieldsOfStudy(fields, ['Машиностроение']));
  // «информатика» as an exam subject is not the group «Информатика и вычислительная техника», and a part of a name is not a name.
  assert.ok(!matchesFieldsOfStudy('информатика', ['Информатика и вычислительная техника']));
  assert.ok(!matchesFieldsOfStudy(fields, ['Информатика']));
  assert.ok(!matchesFieldsOfStudy(fields, ['Радиотехника']));
  assert.ok(matchesFieldsOfStudy('математика;  физика', ['Физика']));
  assert.ok(matchesFieldsOfStudy('науки о земле', ['Науки о Земле']));
  assert.ok(!matchesFieldsOfStudy(null, ['Физика']));
  assert.ok(!matchesFieldsOfStudy('физика', ['']));
});

test('an olympiad suits a direction by the RSOSH list or by subjects, core before related', () => {
  const list = [
    { code: '09.03.04', name: 'Программная инженерия', ugsnName: 'Информатика и вычислительная техника', core: ['Информатика', 'Математика'], related: ['Физика'] },
    { code: '03.03.02', name: 'Физика', ugsnName: 'Физика и астрономия', core: ['Физика'], related: ['Математика'] },
    { code: '31.05.01', name: 'Лечебное дело', ugsnName: 'Клиническая медицина', core: ['Химия', 'Биология'], related: [] },
  ];
  const physics = matchDirections({ subjects: ['Физика'], fieldsOfStudy: ['физика'] }, list);
  assert.deepEqual(physics, [
    { code: '09.03.04', viaRsosh: false, subjectRelevance: 'related' },
    { code: '03.03.02', viaRsosh: true, subjectRelevance: 'core' },
  ]);
  // A technology profile names the group of 09.03.04 although the card's subject is not one of its subjects.
  assert.deepEqual(matchDirections({ subjects: ['Технология'], fieldsOfStudy: [null, 'информатика и вычислительная техника'] }, list),
    [{ code: '09.03.04', viaRsosh: true, subjectRelevance: null }]);
  assert.deepEqual(matchDirections({ subjects: ['История'], fieldsOfStudy: [] }, list), []);
});

test('diploma subjects map to the exams they usually count for', () => {
  assert.deepEqual(examsForSubject('Информатика'), ['Информатика']);
  assert.deepEqual(examsForSubject('Английский язык'), ['Иностранный язык']);
  assert.deepEqual(examsForSubject('Право'), ['Обществознание']);
  assert.deepEqual(examsForSubject('Искусство'), []);
  const spbuMath = { examsRequired: ['Русский язык', 'Математика'], examsChoice: [['Информатика', 'Физика']] };
  assert.ok(programTakesSubjects(spbuMath, ['Физика']));
  assert.ok(programTakesSubjects(spbuMath, ['Информатика']));
  assert.ok(!programTakesSubjects(spbuMath, ['Химия']));
  assert.ok(!programTakesSubjects(spbuMath, ['Искусство']));
  assert.ok(programTakesSubjects({ examsRequired: ['Русский язык', 'Иностранный язык'], examsChoice: [] }, ['Китайский язык']));
});

test('the shipped directions and programs load without errors and cover every university', () => {
  const bundle = buildReference(readReferenceDir(), { today });
  const errors = bundle.issues.filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
  assert.equal(bundle.directions.length, 294);
  assert.equal(bundle.programs.length, 2401);
  assert.equal(new Set(bundle.programs.map(p => p.university)).size, bundle.universities.length);
  const codes = new Set(bundle.directions.map(d => d.code));
  assert.ok(bundle.programs.every(p => codes.has(p.direction)));
  const innopolis = bundle.programs.filter(p => p.university === 'innopolis');
  assert.equal(innopolis.length, 5);
  assert.deepEqual([...new Set(innopolis.map(p => p.direction))].sort(), ['09.03.01', '15.03.06']);
  const se = bundle.directions.find(d => d.code === '09.03.04')!;
  assert.equal(se.educationLevel, 'bachelor'); assert.deepEqual(se.core, ['Информатика', 'Математика']); assert.ok(se.popular);
  assert.ok(se.aliases.includes('прога'));
  // Every olympiad subject of a direction is a catalog subject.
  const catalogSubjects = new Set(['Математика', 'Информатика', 'Физика', 'Биология', 'Химия', 'Обществознание', 'Русский язык', 'История', 'Экономика',
    'География', 'Литература', 'Английский язык', 'Право', 'Искусство', 'Астрономия', 'Экология', 'Робототехника', 'Немецкий язык', 'Французский язык',
    'ИЗО', 'Технология', 'Лингвистика', 'Психология', 'Китайский язык', 'Испанский язык', 'Предпринимательство', 'Черчение', 'ОБЗР', 'Физическая культура',
    'Арабский язык', 'Итальянский язык', 'Японский язык', 'Корейский язык', 'Латинский язык']);
  assert.deepEqual(checkDirectionSubjects(bundle, catalogSubjects), []);
  assert.equal(checkDirectionSubjects(bundle, ['Математика']).length > 0, true);
});

test('broken directions and programs are reported with the file and line', () => {
  const base = readReferenceDir();
  const programsFile = (base.manifest as { sources: { programs: { file: string } } }).sources.programs.file;
  const edit = (path: string, change: (text: string) => string): ReferenceInput =>
    ({ ...base, files: { ...base.files, [path]: Buffer.from(change(base.files[path]!.toString('utf8'))) } });
  const codes = (input: ReferenceInput) => buildReference(input, { today }).issues.filter(i => i.severity === 'error').map(i => i.code);

  const header = 'code;name;education_level;ugsn_code;ugsn_name;ege_subjects;subjects_core;subjects_related;popular;aliases;note\n';
  const directions = (rows: string) => edit(referenceFiles.directions, () => header + rows);
  const ok = '09.03.04;Программная инженерия;бакалавриат;09.00.00;Информатика и вычислительная техника;Математика|Информатика;Информатика;Физика;1;;\n';
  assert.ok(codes(directions(ok + ok)).includes('duplicate_direction'));
  assert.ok(codes(directions(ok.replace('бакалавриат', 'специалитет'))).includes('level_mismatch'));
  assert.ok(codes(directions(ok.replace('09.00.00', '10.00.00'))).includes('ugsn_mismatch'));
  assert.ok(codes(directions(ok.replace('Математика|Информатика', 'Математика|Программирование'))).includes('unknown_exam'));
  assert.ok(codes(directions(ok.replace(';Информатика;Физика;', ';;Физика;'))).includes('no_core_subjects'));
  assert.ok(codes(directions(ok.replace('09.03.04', '09.04.01'))).includes('bad_direction_code'));

  const lines = base.files[programsFile]!.toString('utf8').split('\n');
  const programs = (row: string) => edit(programsFile, () => `${lines[0]}\n${row}\n`);
  const row = 'itmo;09.03.04;Программная инженерия;бакалавриат;Программа;;Русский язык|Математика;Информатика|Физика;0;290;очно;2025;budget;https://tabiturient.ru/vuzu/itmo/proxodnoi/;1';
  assert.deepEqual(codes(programs(row)), []);
  assert.ok(codes(programs(row.replace('itmo;', 'nowhere;'))).includes('unknown_university'));
  assert.ok(codes(programs(row.replace('09.03.04', '09.03.99'))).includes('unknown_direction'));
  assert.ok(codes(programs(row.replace('Информатика|Физика', 'ИКТ|Физика'))).includes('unknown_exam'));
  assert.ok(codes(programs(row.replace(';budget;', ';free;'))).includes('bad_funding'));
  assert.ok(codes(programs(row.replace(';290;очно;2025;', ';290;очно;;'))).includes('bad_year'));
  assert.ok(codes(programs(row.replace(';290;', ';1000;'))).includes('bad_score'));
  const bundle = buildReference(programs(row), { today });
  assert.deepEqual(bundle.programs[0]?.examsChoice, [['Информатика', 'Физика']]);
  assert.ok(bundle.issues.some(i => i.code === 'university_without_programs'));
});

test('«на N из M направлений»: exact rules win, otherwise the estimate by exams', async () => {
  const { directionCoverage } = await import('../apps/api/src/reference/directions.js');
  const programs = [
    { directionCode: '09.03.04', examsRequired: ['Русский язык', 'Математика', 'Информатика'], examsChoice: [] },
    { directionCode: '09.03.04', examsRequired: ['Русский язык', 'Математика'], examsChoice: [['Информатика', 'Физика']] },
    { directionCode: '12.03.03', examsRequired: ['Русский язык', 'Математика'], examsChoice: [['Информатика', 'Физика']] },
    { directionCode: '38.03.01', examsRequired: ['Русский язык', 'Математика', 'Обществознание'], examsChoice: [] },
  ];
  assert.deepEqual(directionCoverage(programs, ['Информатика'], null), { matched: 2, total: 3, source: 'exams' });
  assert.deepEqual(directionCoverage(programs, ['Физика'], null), { matched: 2, total: 3, source: 'exams' });
  assert.equal(directionCoverage(programs, ['Искусство'], null), null); // no exam mapping — say nothing rather than «0 из 3»
  // Rules name a direction without a program in the file: it still counts in M.
  assert.deepEqual(directionCoverage(programs, ['Информатика'], ['09.03.04', '01.03.02']), { matched: 2, total: 4, source: 'rules' });
  assert.deepEqual(directionCoverage([], ['Информатика'], null), null);
});

test('exact benefits by direction are an optional, validated source', () => {
  const base = readReferenceDir();
  const manifest = structuredClone(base.manifest) as { sources: Record<string, unknown> };
  manifest.sources.directionBenefits = [{ file: 'sources/direction_benefits_test.csv' }];
  const input = (rows: string): ReferenceInput => ({ manifest, files: { ...base.files,
    'sources/direction_benefits_test.csv': Buffer.from('university_slug;olympiad;direction_code;benefit;source_url;source_page\n' + rows) } });
  const ok = 'itmo;Высшая проба;09.03.04;БВИ / 100 баллов;https://abit.itmo.ru/rules.pdf;12\n';
  const bundle = buildReference(input(ok), { today });
  assert.deepEqual(bundle.issues.filter(i => i.severity === 'error'), []);
  assert.deepEqual(bundle.directionBenefits.map(b => [b.university, b.series, b.direction, b.kind, b.sourcePage]),
    [['itmo', 'hse-vysshaya-proba', '09.03.04', 'bvi', '12'], ['itmo', 'hse-vysshaya-proba', '09.03.04', 'score_100', '12']]);
  const codes = (rows: string) => buildReference(input(rows), { today }).issues.filter(i => i.severity === 'error').map(i => i.code);
  assert.ok(codes(ok.replace('09.03.04', '09.03.99')).includes('unknown_direction'));
  assert.ok(codes(ok.replace('itmo;', 'nowhere;')).includes('unknown_university'));
  assert.ok(codes(ok.replace('Высшая проба', 'Неизвестная олимпиада')).includes('unknown_olympiad'));
  assert.ok(codes(ok.replace('https://abit.itmo.ru/rules.pdf', 'правила')).includes('bad_url'));
  assert.equal(buildReference(base, { today }).directionBenefits.length, 0);
});
