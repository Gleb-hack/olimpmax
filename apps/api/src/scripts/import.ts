import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDatabase } from './shared.js';
import { importCsv } from '../import/importer.js';
import { buildReference, defaultReferenceDir, readReferenceDir, referenceFiles } from '../reference/load.js';
import { moscowToday } from '../features/calendar.js';

const flags = ['--replace-catalog', '--skip-reference'];
const args = process.argv.slice(2);
if (args.some(arg => arg.startsWith('--') && !flags.includes(arg)) || args.filter(arg => !arg.startsWith('--')).length > 1) {
  throw new Error('Использование: db:import [путь.csv] [--replace-catalog] [--skip-reference]');
}
const customFile = args.find(arg => !arg.startsWith('--'));
const file = customFile ? resolve(customFile) : fileURLToPath(new URL('../../../../data/catalog/olimpiady.csv', import.meta.url));
const buffer = await readFile(file);
// Cards missing from the olimpiada.ru export (data/reference/catalog-additions.csv) are imported with it.
const additionsFile = fileURLToPath(new URL(referenceFiles.additions, defaultReferenceDir));
const additions = existsSync(additionsFile) ? { buffer: await readFile(additionsFile), sourceFile: `data/reference/${referenceFiles.additions}` } : undefined;
const reference = args.includes('--skip-reference') ? undefined : buildReference(readReferenceDir(), { today: moscowToday() });
const report = await withDatabase(db => importCsv(db, buffer, file, {
  replaceCatalog: !customFile || args.includes('--replace-catalog'), additions, reference,
}));
await writeFile(new URL('../../../../data/import-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
const { reference: referenceReport, ...catalogReport } = report;
console.log(JSON.stringify({ ...catalogReport, reference: referenceReport && 'issues' in referenceReport
  ? { ...referenceReport, issues: `${referenceReport.issues.length} (см. data/import-report.json)` } : referenceReport }, null, 2));
