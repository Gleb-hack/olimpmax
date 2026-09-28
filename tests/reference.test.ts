import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nameKey, combineLevels, parseGeneralLevel, parseRuDates, isoDay, isPlaceholderSchedule, isOutdatedSchedule, scheduleQuality,
  parseBenefit, parseBenefits, parseRequirement, REQUIREMENT_NOT_NEEDED, stageKind, stageMode, dayMonthMentions, scheduleConflicts, type ScheduleStage,
} from '../apps/api/src/reference/model.js';
import { resolveLevel, catalogLevel } from '../apps/api/src/reference/levels.js';
import { buildReference, readReferenceDir, checkAgainstCatalog, referenceFiles, type ReferenceInput } from '../apps/api/src/reference/load.js';
import { parseCsv } from '../apps/api/src/import/csv.js';

const today = '2026-09-27';
const schedule = (...pairs: [string, string][]): ScheduleStage[] => pairs.map(([name, rawDates]) => ({ name, rawDates, dates: parseRuDates(rawDates) }));
const rsosh = { season: '2026/27', status: 'Проект РСОШ 2026/27', url: 'https://example.org/list' };

test('names match across sources regardless of case, ё, quotes and dashes', () => {
  assert.equal(nameKey('«Покори Воробьёвы горы!»'), nameKey('Покори Воробьевы горы!'));
  assert.equal(nameKey('Миссия выполнима. Твоё призвание — финансист!'), nameKey('Миссия выполнима. Твое призвание - финансист!'));
  assert.equal(nameKey('Олимпиада РАНХиГС'), nameKey('Олимпиада РАНХИГС'));
  assert.notEqual(nameKey('Покори Воробьевы гор!'), nameKey('Покори Воробьевы горы!'));
});

test('Russian stage dates keep the stated year only', () => {
  assert.deepEqual(parseRuDates('до 25 сентября'), { from: null, to: { day: 25, month: 9, year: null }, open: true });
  assert.deepEqual(parseRuDates('23-25 января'), { from: { day: 23, month: 1, year: null }, to: { day: 25, month: 1, year: null }, open: false });
  assert.deepEqual(parseRuDates('30 декабря — 1 января')?.from, { day: 30, month: 12, year: null });
  const crossing = parseRuDates('16 декабря 2025 — 20 января 2026')!;
  assert.equal(isoDay(crossing.from), '2025-12-16'); assert.equal(isoDay(crossing.to), '2026-01-20');
  const sameYear = parseRuDates('10 октября — 30 ноября 2025')!;
  assert.equal(isoDay(sameYear.from), '2025-10-10');
  assert.equal(isoDay(parseRuDates('24 января — 22 марта 2026 (дата зависит от направления)')!.from), '2026-01-24');
  assert.equal(isoDay(parseRuDates('5 — 30 ноября 2025')!.from), '2025-11-05');
  assert.equal(isoDay(parseRuDates('9–11 февраля')!.to), null);
  assert.equal(parseRuDates('13 мая')!.to.month, 5);
  assert.equal(parseRuDates('13 марта')!.to.month, 3);
  assert.equal(parseRuDates('уточняется'), null);
  assert.equal(parseRuDates('31 февраля 2026'), null);
});

test('stage kind and participation mode', () => {
  assert.equal(stageKind('Регистрация на отборочный этап'), 'registration');
  assert.equal(stageKind('Приём заявок на 1-й отборочный тур'), 'registration');
  assert.equal(stageKind('Полуфинал (очный)'), 'competition');
  assert.equal(stageMode('онлайн'), 'online');
  assert.equal(stageMode('онлайн/заочно'), 'online');
  assert.equal(stageMode('очно/дистанционно'), 'mixed');
  assert.equal(stageMode(''), null);
  assert.equal(stageMode('по почте'), undefined);
});

test('levels: per-profile ranges and general levels', () => {
  assert.equal(combineLevels([2]), 'II');
  assert.equal(combineLevels([3, 2, 3]), 'II–III');
  assert.equal(combineLevels([1, 3]), 'I–III');
  assert.equal(combineLevels([]), null);
  assert.equal(parseGeneralLevel('ВсОШ'), 'ВсОШ');
  assert.equal(parseGeneralLevel('—'), null);
  assert.throws(() => parseGeneralLevel('IV'));
});

test('placeholder, outdated and trusted schedules are told apart', () => {
  const lomonosov = schedule(['Регистрация', 'до 24 ноября'], ['Отборочный этап', 'до 14 декабря'], ['Заключительный этап', '13-15 января']);
  const phystech = schedule(['Регистрация', 'до 7 сентября'], ['Отборочный этап', 'до 4 октября'], ['Заключительный этап', '13-14 февраля']);
  const zvezda = schedule(['Интернет-тур', '20 октября — 30 ноября 2025'], ['Заключительный этап', '1 февраля 2026']);
  assert.equal(isPlaceholderSchedule(lomonosov), true);
  assert.equal(isPlaceholderSchedule(phystech), false);
  assert.equal(isOutdatedSchedule(zvezda, today), true);
  assert.equal(isOutdatedSchedule(zvezda, '2026-03-01'), false);
  assert.equal(isOutdatedSchedule(phystech, today), false);
  assert.equal(scheduleQuality(lomonosov, { review: '', duplicated: false, today }), 'placeholder');
  assert.equal(scheduleQuality(lomonosov, { review: 'ok', duplicated: false, today }), 'ok');
  assert.equal(scheduleQuality(phystech, { review: '', duplicated: true, today }), 'placeholder');
  assert.equal(scheduleQuality(phystech, { review: 'hide', duplicated: false, today }), 'hidden');
  assert.equal(scheduleQuality(zvezda, { review: '', duplicated: false, today }), 'outdated');
});

test('a card keeps its own olimpiada.ru calendar when it shares no date with the series schedule', () => {
  const series = ['до 20 ноября', 'до 22 ноября', 'до 26 февраля', '28 февраля'];
  assert.deepEqual([...dayMonthMentions('Регистрация: 26 окт—20 ноя\nОтборочный этап: 1—2 дек')], ['26.10', '20.11', '1.12', '2.12']);
  assert.equal(scheduleConflicts('Регистрация на отборочный этап: 28 сен—16 окт\nОтборочный этап: 18 окт', 'Опубликован', series), true);
  assert.equal(scheduleConflicts('Регистрация на отборочный этап: 26 окт—20 ноя\nОтборочный этап: 22 ноя', 'Опубликован', series), false);
  assert.equal(scheduleConflicts('Публикация расписания: ожидается в октябре 2026 года', 'Частично заполнен по текущему статусу', series), false);
  assert.equal(scheduleConflicts('Отборочный этап: 28 сен—16 окт', 'Частично опубликован', series), false);
});

test('benefits and ЕГЭ requirements are normalized; OCR notes mean «not stated»', () => {
  assert.deepEqual(parseBenefit('БВИ'), { kind: 'bvi', diploma: 'any' });
  assert.deepEqual(parseBenefit('БВИ победителям'), { kind: 'bvi', diploma: 'winner' });
  assert.deepEqual(parseBenefit('100 баллов'), { kind: 'score_100', diploma: 'any' });
  assert.equal(parseBenefit('скидка'), null);
  assert.deepEqual(parseRequirement('ЕГЭ от75 до 85 баллов по профильному предмету.'),
    { minScore: 75, maxScore: 85, text: 'ЕГЭ по профильному предмету от 75 до 85 баллов', known: true });
  assert.equal(parseRequirement('ЕГЭ от 75 баллов по профильному предмету.').minScore, 75);
  assert.deepEqual(parseRequirement('не видно на предоставленных скриншотах'), { minScore: null, maxScore: null, text: null, known: true });
  assert.equal(parseRequirement('по решению приёмной комиссии').known, false);
  // The 2026 delivery lists two benefits in one cell and marks ВсОШ diplomas as not needing ЕГЭ confirmation.
  assert.deepEqual(parseBenefits('БВИ / 100 баллов'), [{ kind: 'bvi', diploma: 'any' }, { kind: 'score_100', diploma: 'any' }]);
  assert.deepEqual(parseBenefits('БВИ / 100 баллов победителям'), [{ kind: 'bvi', diploma: 'winner' }, { kind: 'score_100', diploma: 'winner' }]);
  assert.deepEqual(parseBenefits('БВИ'), [{ kind: 'bvi', diploma: 'any' }]);
  assert.equal(parseBenefits('БВИ / скидка'), null);
  assert.deepEqual(parseRequirement('Не требуется.'), { minScore: null, maxScore: null, text: REQUIREMENT_NOT_NEEDED, known: true });
});

test('level priority: RSOSH profile, then catalog verdict, then the series general level', () => {
  const series = { name: 'Олимпиада РАНХиГС', generalLevel: 'III' as const, profiles: new Map([['история', 2], ['экономика', 3]]) };
  const raw = { 'Уровень олимпиады': '—', 'Статус уровня': 'Точное соответствие проекту РСОШ 2026/27 не найдено' };
  assert.equal(resolveLevel({ rawSource: raw, link: { profiles: ['история'] }, series, rsosh }).level, 'II');
  assert.equal(resolveLevel({ rawSource: raw, link: { profiles: ['история', 'экономика'] }, series, rsosh }).level, 'II–III');
  assert.equal(resolveLevel({ rawSource: raw, link: { profiles: ['*'] }, series, rsosh }).levelProfile, 'все профили (2)');
  const outside = resolveLevel({ rawSource: raw, link: { profiles: [] }, series, rsosh });
  assert.equal(outside.level, null); assert.match(outside.levelStatus!, /не входит в перечень/);
  assert.throws(() => resolveLevel({ rawSource: raw, link: { profiles: ['право'] }, series, rsosh }));
  const notListed = { ...series, profiles: new Map<string, number>() };
  assert.equal(resolveLevel({ rawSource: raw, link: { profiles: [] }, series: notListed, rsosh }).level, 'III');
  assert.equal(resolveLevel({ rawSource: raw, link: { profiles: [] }, series: notListed, rsosh }).levelSource, 'series');
  const catalogII = { 'Уровень олимпиады': 'II', 'Профиль уровня': 'физика', 'Статус уровня': 'Проект РСОШ 2026/27' };
  assert.equal(resolveLevel({ rawSource: catalogII, link: { profiles: [] }, series: notListed, rsosh }).level, 'II');
  const rejected = { 'Уровень олимпиады': '—', 'Статус уровня': 'Этот профиль не найден в проекте РСОШ 2026/27' };
  assert.equal(resolveLevel({ rawSource: rejected, link: { profiles: [] }, series: notListed, rsosh }).level, null);
  assert.deepEqual(catalogLevel({ 'Уровень олимпиады': 'ВсОШ', 'Профиль уровня': 'Физика' }).level, 'ВсОШ');
});

test('bundled reference data is consistent with the catalog', () => {
  const input = readReferenceDir();
  const bundle = buildReference(input, { today });
  assert.deepEqual(bundle.issues.filter(i => i.severity === 'error'), []);
  assert.equal(bundle.series.length, 95);
  assert.equal(bundle.links.length, 357);
  // 611 from the first file + 1240 from vuzi_olympiad_benefits_2026 («БВИ / 100 баллов» rows give two benefits each).
  assert.equal(bundle.benefits.length, 1851);
  assert.equal(bundle.universities.length, 23);
  assert.deepEqual(bundle.issues.filter(i => i.code === 'skipped_olympiad'), []);
  const bmstu = bundle.benefits.filter(b => b.university === 'bmstu' && b.series === 'innopolis-open');
  assert.deepEqual(bmstu.map(b => b.kind).sort(), ['bvi', 'score_100']);
  assert.equal(bundle.benefits.find(b => b.university === 'mgimo' && b.series === 'vsosh-history')!.requirement, REQUIREMENT_NOT_NEEDED);
  assert.equal(bundle.links.filter(l => l.series === 'vsosh-foreign-languages').length, 6);
  const byslug = new Map(bundle.series.map(s => [s.slug, s]));
  assert.equal(byslug.get('ranepa')!.profiles.get('история')!.level, 2);
  assert.equal(byslug.get('ranepa')!.generalLevel, 'III');
  assert.equal(byslug.get('lomonosov')!.scheduleQuality, 'placeholder');
  assert.equal(byslug.get('zvezda')!.scheduleQuality, 'outdated');
  assert.equal(byslug.get('hse-vysshaya-proba')!.scheduleQuality, 'ok');
  assert.equal(bundle.series.filter(s => s.scheduleQuality === 'placeholder').length, 26);
  // OCR typos in the benefits file resolve through aliases.
  assert.equal(bundle.benefits.filter(b => b.series === 'defense-tech' && b.university === 'hse').length, 1);
  const main = parseCsv(readFileSync(new URL('../olimpiady.csv', import.meta.url)));
  const additions = parseCsv(readFileSync(new URL(`../data/reference/${referenceFiles.additions}`, import.meta.url)));
  assert.equal(additions.length, 58);
  const ids = new Set(main.map(r => r.olympiad.id));
  assert.ok(additions.every(r => !ids.has(r.olympiad.id)));
  const catalog = [...main, ...additions].map(r => ({ id: r.olympiad.id, title: r.olympiad.title, sourceGroup: r.olympiad.sourceGroup, rawSource: r.olympiad.rawSource }));
  assert.deepEqual(checkAgainstCatalog(bundle, catalog).filter(i => i.code === 'link_not_in_catalog' || i.code === 'unlinked_group_member'), []);
});

test('unknown names, profiles and series are errors, not silent skips', () => {
  const input = readReferenceDir();
  const patch = (path: string, edit: (text: string) => string): ReferenceInput => ({ ...input, files: { ...input.files, [path]: Buffer.from(edit(input.files[path]!.toString('utf8'))) } });
  const benefits = 'sources/vuzi_olympiad_benefits_cleaned.csv';
  const unknownName = buildReference(patch(benefits, t => t + 'ИТМО,Санкт-Петербург,Несуществующая олимпиада,БВИ,ЕГЭ от 75 баллов\n'), { today });
  assert.ok(unknownName.issues.some(i => i.code === 'unknown_olympiad' && i.message.includes('Несуществующая олимпиада')));
  // A delivery marked skipUnknownOlympiads drops olympiads that are not in the project with a warning instead.
  const extra = 'sources/vuzi_olympiad_benefits_2026.csv';
  const skipped = buildReference(patch(extra, t => t + 'МИРЭА,Москва,Несуществующая олимпиада,БВИ,Не требуется.\n'), { today });
  assert.deepEqual(skipped.issues.filter(i => i.severity === 'error'), []);
  assert.ok(skipped.issues.some(i => i.code === 'skipped_olympiad' && i.message.includes('Несуществующая олимпиада')));
  assert.equal(skipped.benefits.length, 1851);
  const badProfile = buildReference(patch(referenceFiles.links, t => t.replace('5285;ranepa;история;', '5285;ranepa;астрология;')), { today });
  assert.ok(badProfile.issues.some(i => i.code === 'unknown_profile'));
  const badSeries = buildReference(patch(referenceFiles.links, t => t.replace('5285;ranepa;', '5285;ranepa-x;')), { today });
  assert.ok(badSeries.issues.some(i => i.code === 'unknown_series'));
  const duplicate = buildReference(patch(referenceFiles.links, t => t + '5285;ranepa;история;;\n'), { today });
  assert.ok(duplicate.issues.some(i => i.code === 'duplicate_link'));
  const reviewed = buildReference(patch(referenceFiles.series, t => t.replace(/^(lomonosov;[^\n]*?);;([^;\n]*)$/m, '$1;ok;$2')), { today });
  assert.equal(reviewed.series.find(s => s.slug === 'lomonosov')!.scheduleQuality, 'ok');
});
