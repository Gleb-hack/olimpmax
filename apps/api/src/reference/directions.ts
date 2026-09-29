// Pure rules that connect olympiads, directions of study and university programs.
// Nothing here touches files or the database, so every rule is covered by unit tests.

/** Subjects of the Unified State Exam as written in directions.csv and university_programs.csv. Russian is required everywhere. */
export const EGE_SUBJECTS = ['Русский язык', 'Математика', 'Информатика', 'Физика', 'Химия', 'Биология', 'Обществознание',
  'История', 'Литература', 'География', 'Иностранный язык'] as const;
export type EgeSubject = typeof EGE_SUBJECTS[number];
export const isEgeSubject = (value: string): value is EgeSubject => (EGE_SUBJECTS as readonly string[]).includes(value);

export type EducationLevel = 'bachelor' | 'specialist';
export type SubjectRelevance = 'core' | 'related';
export type ProgramFunding = 'budget' | 'paid_only' | 'quota_only';
export const PROGRAM_FUNDING: readonly ProgramFunding[] = ['budget', 'paid_only', 'quota_only'];

/** «09.03.04»: the middle part is the level — 03 bachelor, 05 specialist. */
export const directionCodePattern = /^\d{2}\.0[35]\.\d{2}$/;
export function levelFromCode(code: string): EducationLevel | null {
  if (!directionCodePattern.test(code)) return null;
  return code.slice(3, 5) === '03' ? 'bachelor' : 'specialist';
}
export const ugsnCodeOf = (code: string) => `${code.slice(0, 2)}.00.00`;
export function parseEducationLevel(value: string): EducationLevel | null {
  const v = value.trim().toLocaleLowerCase('ru');
  return v === 'бакалавриат' ? 'bachelor' : v === 'специалитет' ? 'specialist' : null;
}

const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е')
  .replace(/\s*[,;]\s*/g, ', ').replace(/\s+/g, ' ').trim();
/**
 * The RSOSH list gives, for every olympiad profile, a comma-separated mix of exam subjects, groups of directions
 * (УГСН) and single directions: «информатика и вычислительная техника, информационная безопасность, физика».
 * A direction matches when its group name or its own name is one whole item of that list. Group names may contain
 * commas themselves («электроника, радиотехника и системы связи»), so items are compared as whole comma-bounded runs.
 */
export function matchesFieldsOfStudy(fieldsOfStudy: string | null, names: string[]) {
  if (!fieldsOfStudy?.trim()) return false;
  const text = `, ${normalize(fieldsOfStudy)},`;
  return names.some(name => {
    const n = normalize(name);
    return n.length > 0 && text.includes(`, ${n},`);
  });
}

export type DirectionMatchInput = { code: string; name: string; ugsnName: string; core: string[]; related: string[] };
export type OlympiadMatchInput = { subjects: string[]; fieldsOfStudy: (string | null)[] };
export type DirectionMatch = { code: string; viaRsosh: boolean; subjectRelevance: SubjectRelevance | null };
/**
 * Why an olympiad suits a direction:
 * - viaRsosh — a covered RSOSH profile of the card names the direction or its group (the official correspondence);
 * - subjectRelevance — a subject of the card is a core or a related subject of the direction (directions.csv, a recommendation).
 * Directions with neither are not returned.
 */
export function matchDirections(olympiad: OlympiadMatchInput, directions: DirectionMatchInput[]): DirectionMatch[] {
  const subjects = new Set(olympiad.subjects);
  const fields = olympiad.fieldsOfStudy.filter((f): f is string => !!f?.trim());
  const result: DirectionMatch[] = [];
  for (const d of directions) {
    const viaRsosh = fields.some(f => matchesFieldsOfStudy(f, [d.ugsnName, d.name]));
    const subjectRelevance = d.core.some(s => subjects.has(s)) ? 'core' : d.related.some(s => subjects.has(s)) ? 'related' : null;
    if (viaRsosh || subjectRelevance) result.push({ code: d.code, viaRsosh, subjectRelevance });
  }
  return result;
}

const languages = ['Английский язык', 'Немецкий язык', 'Французский язык', 'Китайский язык', 'Испанский язык', 'Итальянский язык',
  'Японский язык', 'Корейский язык', 'Арабский язык', 'Латинский язык'];
/**
 * Exam that a diploma in a catalog subject usually counts for (100 points or confirmation of БВИ).
 * Conservative on purpose: subjects without a clear exam (art, psychology, technology…) get none.
 */
export function examsForSubject(subject: string): EgeSubject[] {
  if (isEgeSubject(subject)) return [subject];
  if (languages.includes(subject)) return ['Иностранный язык'];
  switch (subject) {
    case 'Право': return ['Обществознание'];
    case 'Экономика': return ['Математика', 'Обществознание'];
    case 'Астрономия': return ['Физика'];
    case 'Робототехника': return ['Информатика', 'Физика'];
    case 'Экология': return ['Биология', 'География'];
    case 'Лингвистика': return ['Иностранный язык', 'Русский язык'];
    default: return [];
  }
}
/**
 * A program «takes» the olympiad subject when one of its exams (required or to choose) is the subject's exam.
 * Russian is required everywhere, so a Russian olympiad matches any program; the direction match narrows it down.
 */
export function programTakesSubjects(program: { examsRequired: string[]; examsChoice: string[][] }, subjects: string[]) {
  const exams = new Set([...program.examsRequired, ...program.examsChoice.flat()]);
  return subjects.some(s => examsForSubject(s).some(e => exams.has(e)));
}

export type CoverageSource = 'rules' | 'exams';
export type DirectionCoverage = { matched: number; total: number; source: CoverageSource };
type CoverageProgram = { directionCode: string; examsRequired: string[]; examsChoice: string[][] };
/**
 * «На N из M направлений» for one university and one olympiad.
 * - rules: exact rows from admission rules (direction_benefits) — N is the directions they list;
 * - exams: an estimate — N is the directions where a program has the exam the diploma counts for.
 * M is every direction of the university known from programs (plus directions named by the rules).
 * An estimate of zero is not shown (null): the benefit exists, the exam mapping just does not say where.
 */
export function directionCoverage(programs: CoverageProgram[], cardSubjects: string[], ruleDirections: string[] | null): DirectionCoverage | null {
  const all = new Set(programs.map(p => p.directionCode));
  if (ruleDirections?.length) {
    for (const code of ruleDirections) all.add(code);
    return { matched: new Set(ruleDirections).size, total: all.size, source: 'rules' };
  }
  const matched = new Set(programs.filter(p => programTakesSubjects(p, cardSubjects)).map(p => p.directionCode));
  return matched.size ? { matched: matched.size, total: all.size, source: 'exams' } : null;
}
