import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
export function connectDatabase(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  // An idle connection closed by the server (restart, failover, DROP DATABASE … FORCE) must not crash the process;
  // the pool replaces it on the next query. 57P01 = admin_shutdown, expected during restarts.
  pool.on('error', error => {
    if ((error as { code?: string }).code !== '57P01') console.error('PostgreSQL: ошибка неактивного соединения', error.message);
  });
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof connectDatabase>['db'];
