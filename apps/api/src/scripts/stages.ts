import { readFile } from 'node:fs/promises';
import { withDatabase } from './shared.js';
import { importVerifiedStages } from '../import/verified-stages.js';
if (!process.argv[2]) throw new Error('Использование: pnpm db:stages path/to/verified-stages.json');
const input: unknown = JSON.parse(await readFile(process.argv[2], 'utf8'));
console.log(await withDatabase(db => importVerifiedStages(db, input)));
