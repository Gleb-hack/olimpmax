import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { olympiads, subjects, olympiadSubjects, stages, importRuns } from '../db/schema.js';
import { auditCsv, parseCsv, hash } from './csv.js';

export async function importCsv(db: Database, buffer: Buffer, sourceFile: string, options: { replaceCatalog?: boolean } = {}) {
  const rows = parseCsv(buffer); // Validate the entire file before making any database changes.
  const report = auditCsv(buffer);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(17012026)`);
    const old = await tx.select({ id: olympiads.id, hash: olympiads.calendarHash }).from(olympiads);
    const oldById = new Map(old.map(o => [o.id, o.hash]));
    const names = [...new Set(rows.flatMap(r => r.subjectNames))].sort();
    await tx.insert(subjects).values(names.map(name => ({ name }))).onConflictDoNothing();
    const subjectRows = await tx.select().from(subjects);
    const subjectByName = new Map(subjectRows.map(s => [s.name, s.id]));
    const now = new Date().toISOString();
    let invalidatedStages = 0;
    for (const row of rows) {
      const value = { ...row.olympiad, inCatalog: true, importedAt: now };
      await tx.insert(olympiads).values(value).onConflictDoUpdate({ target: olympiads.id, set: value });
      await tx.delete(olympiadSubjects).where(eq(olympiadSubjects.olympiadId, value.id));
      await tx.insert(olympiadSubjects).values(row.subjectNames.map(name => ({ olympiadId: value.id, subjectId: subjectByName.get(name)! })));
      if (oldById.has(value.id) && oldById.get(value.id) !== value.calendarHash) {
        const updated = await tx.update(stages).set({ verification: 'needs_review', updatedAt: now })
          .where(and(eq(stages.olympiadId, value.id), eq(stages.origin, 'verified_import'), eq(stages.verification, 'verified'))).returning({ id: stages.id });
        invalidatedStages += updated.length;
      }
      const csvStages = and(eq(stages.olympiadId, value.id), eq(stages.origin, 'csv'));
      const keys = row.stages.map(s => s.sourceKey);
      await tx.delete(stages).where(keys.length ? and(csvStages, notInArray(stages.sourceKey, keys)) : csvStages);
      for (const stage of row.stages) {
        const stageValue = { ...stage, olympiadId: value.id, origin: 'csv' as const,
          calendarHash: value.calendarHash, sourceUrl: value.sourceUrl, updatedAt: now };
        await tx.insert(stages).values(stageValue).onConflictDoUpdate({
          target: [stages.olympiadId, stages.origin, stages.sourceKey], set: stageValue,
        });
      }
    }
    const sourceIds = new Set(rows.map(r => r.olympiad.id));
    const missingFromFile = old.filter(r => !sourceIds.has(r.id)).map(r => r.id);
    if (options.replaceCatalog && missingFromFile.length) {
      await tx.update(olympiads).set({ inCatalog: false }).where(inArray(olympiads.id, missingFromFile));
    }
    // Missing rows are deliberately retained: a partial crawl must not erase a user's plan.
    const result = { ...report, inserted: rows.filter(r => !oldById.has(r.olympiad.id)).length,
      updated: rows.filter(r => oldById.has(r.olympiad.id)).length, invalidatedStages, missingFromFile,
      hiddenFromCatalog: options.replaceCatalog ? missingFromFile.length : 0 };
    await tx.insert(importRuns).values({ sourceFile, sha256: hash(buffer), rowCount: rows.length, report: result });
    return result;
  });
}
