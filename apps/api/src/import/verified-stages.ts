import { and, eq, sql } from 'drizzle-orm';
import { VerifiedStagesFile } from '../../../../packages/contracts/src/index.js';
import type { Database } from '../db/client.js';
import { olympiads, stages } from '../db/schema.js';
export async function importVerifiedStages(db: Database, input: unknown, now = new Date()) {
  const rows = VerifiedStagesFile.parse(input);
  const keys = rows.map(s => `${s.olympiadId}:${s.key}`);
  if (new Set(keys).size !== keys.length) throw new Error('Повторные ключи этапов');
  if (rows.some(s => new Date(s.verifiedAt).getTime() > now.getTime() + 30000)) throw new Error('Дата проверки не может быть в будущем');
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(17012026)`);
    for (const row of rows) {
      const [olympiad] = await tx.select().from(olympiads).where(eq(olympiads.id, row.olympiadId));
      if (!olympiad) throw new Error(`Олимпиада ${row.olympiadId} не найдена`);
      if (olympiad.scheduleStatus === 'not_held') throw new Error(`Олимпиада ${row.olympiadId} помечена как не проводящаяся; сначала обновите каталог`);
      const { key, ...rest } = row;
      const value = { ...rest, sourceKey: key, origin: 'verified_import' as const,
        verification: 'verified' as const, calendarHash: olympiad.calendarHash, updatedAt: now.toISOString() };
      await tx.insert(stages).values(value).onConflictDoUpdate({ target: [stages.olympiadId, stages.origin, stages.sourceKey], set: value });
    }
    return { verifiedStages: rows.length };
  });
}
