import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { withDatabase } from './shared.js';
await withDatabase(db => migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) }));
console.log('Миграции применены');
