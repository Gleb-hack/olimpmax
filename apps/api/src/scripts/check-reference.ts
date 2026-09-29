// pnpm data:check — validate data/reference against the catalog CSV without a database.
// Writes data/reference-report.json and exits with code 1 if there are errors.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../import/csv.js';
import { buildReference, checkAgainstCatalog, checkDirectionSubjects, defaultReferenceDir, readReferenceDir, referenceFiles } from '../reference/load.js';
import { referenceSummary } from '../reference/summary.js';
import { moscowToday } from '../features/calendar.js';

const bundle = buildReference(readReferenceDir(), { today: moscowToday() });
const main = parseCsv(readFileSync(new URL('../../../../data/catalog/olimpiady.csv', import.meta.url)));
const additionsPath = fileURLToPath(new URL(referenceFiles.additions, defaultReferenceDir));
const extra = existsSync(additionsPath) ? parseCsv(readFileSync(additionsPath)) : [];
const ids = new Set(main.map(r => r.olympiad.id));
const catalog = [...main, ...extra.filter(r => !ids.has(r.olympiad.id))].map(r => ({ id: r.olympiad.id, title: r.olympiad.title, sourceGroup: r.olympiad.sourceGroup, rawSource: r.olympiad.rawSource }));
const catalogSubjects = new Set([...main, ...extra].flatMap(r => r.subjectNames));
const issues = [...bundle.issues, ...checkAgainstCatalog(bundle, catalog), ...checkDirectionSubjects(bundle, catalogSubjects)];
const report = { checkedAt: new Date().toISOString(), referenceSha256: bundle.sha256, ...referenceSummary(bundle, catalog),
  directions: bundle.directions.length, programs: bundle.programs.length,
  errors: issues.filter(i => i.severity === 'error').map(i => `${i.code}: ${i.message}`),
  warnings: issues.filter(i => i.severity === 'warning').map(i => `${i.code}: ${i.message}`) };
writeFileSync(new URL('../../../../data/reference-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
const { warnings, levelChanges, scheduleComparison, scheduleConflicts, series, ...short } = report;
console.log(JSON.stringify({ ...short, levelChanges: levelChanges.length, scheduleComparison: scheduleComparison.length,
  scheduleConflicts: scheduleConflicts.length, series: series.length, warnings: warnings.length }, null, 2));
console.log(report.errors.length ? `Ошибок: ${report.errors.length}` : `Ошибок нет, предупреждений: ${warnings.length}. Подробности: data/reference-report.json`);
if (report.errors.length) process.exitCode = 1;
