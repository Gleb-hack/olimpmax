import { readFile, writeFile } from 'node:fs/promises';
import { auditCsv } from '../import/csv.js';
const file = process.argv[2] ?? new URL('../../../../olimpiady.csv', import.meta.url);
const report = auditCsv(await readFile(file));
await writeFile(new URL('../../../../data/source-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
