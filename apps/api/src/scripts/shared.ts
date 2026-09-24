import { connectDatabase } from '../db/client.js';
export async function withDatabase<T>(operation: (db: ReturnType<typeof connectDatabase>['db']) => Promise<T>) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Укажите DATABASE_URL в .env');
  const { db, pool } = connectDatabase(url);
  try { return await operation(db); } finally { await pool.end(); }
}
