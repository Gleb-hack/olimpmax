// pnpm db:reference [каталог] — load data/reference into PostgreSQL without re-importing the catalog.
import { resolve } from 'node:path';
import { withDatabase } from './shared.js';
import { applyReference } from '../reference/apply.js';
import { buildReference, readReferenceDir } from '../reference/load.js';
import { moscowToday } from '../features/calendar.js';

const dir = process.argv[2] ? resolve(process.argv[2]) : undefined;
const bundle = buildReference(readReferenceDir(dir), { today: moscowToday() });
const report = await withDatabase(db => applyReference(db, bundle, dir ?? 'data/reference'));
console.log(JSON.stringify({ ...report, issues: report.issues.slice(0, 40), moreIssues: Math.max(0, report.issues.length - 40) }, null, 2));
