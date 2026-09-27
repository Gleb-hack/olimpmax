import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { olympiads, subjects, olympiadSubjects, stages, importRuns } from '../db/schema.js';
import { auditCsv, parseCsv, hash, type ParsedRow } from './csv.js';
import { applyReferenceTx, assertValid, importLockId, recomputeLevels, type Executor } from '../reference/apply.js';
import { catalogLevel } from '../reference/levels.js';
import type { ReferenceBundle } from '../reference/load.js';

export type CatalogImportOptions = {
  replaceCatalog?: boolean;
  /** Extra cards in the same CSV format (data/reference/catalog-additions.csv). The main export wins on the same ID. */
  additions?: { buffer: Buffer; sourceFile: string };
  /** Reference layer applied in the same transaction, so levels, series and benefits always match the imported catalog. */
  reference?: ReferenceBundle;
};

export async function importCsv(db: Database, buffer: Buffer, sourceFile: string, options: CatalogImportOptions = {}) {
  const main = parseCsv(buffer); // Validate every file before making any database changes.
  const extra = options.additions ? parseCsv(options.additions.buffer) : [];
  if (options.reference) assertValid(options.reference);
  const mainIds = new Set(main.map(r => r.olympiad.id));
  const additions = extra.filter(r => !mainIds.has(r.olympiad.id));
  const rows = [...main, ...additions];
  const report = {
    ...auditCsv(buffer),
    ...(options.additions ? { additionsFile: options.additions.sourceFile, additions: additions.length,
      additionsSuperseded: extra.filter(r => mainIds.has(r.olympiad.id)).map(r => r.olympiad.id) } : {}),
  };
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${importLockId})`);
    const result = { ...report, ...await importRows(tx, rows, options.replaceCatalog ?? false) };
    const reference = options.reference ? await applyReferenceTx(tx, options.reference) : { levels: await recomputeLevels(tx) };
    const full = { ...result, reference };
    const digest = hash(Buffer.concat([buffer, options.additions?.buffer ?? Buffer.alloc(0), Buffer.from(options.reference?.sha256 ?? '')]));
    await tx.insert(importRuns).values({ sourceFile, sha256: digest, rowCount: rows.length, report: full });
    return full;
  });
}

async function importRows(tx: Executor, rows: ParsedRow[], replaceCatalog: boolean) {
  const old = await tx.select({ id: olympiads.id, hash: olympiads.calendarHash }).from(olympiads);
  const oldById = new Map(old.map(o => [o.id, o.hash]));
  const names = [...new Set(rows.flatMap(r => r.subjectNames))].sort();
  await tx.insert(subjects).values(names.map(name => ({ name }))).onConflictDoNothing();
  const subjectRows = await tx.select().from(subjects);
  const subjectByName = new Map(subjectRows.map(s => [s.name, s.id]));
  const now = new Date().toISOString();
  let invalidatedStages = 0;
  for (const row of rows) {
    // Levels start from the export's own columns; the reference layer refines them right after (recomputeLevels).
    const value = { ...row.olympiad, ...catalogLevel(row.olympiad.rawSource), inCatalog: true, importedAt: now };
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
  if (replaceCatalog && missingFromFile.length) {
    await tx.update(olympiads).set({ inCatalog: false }).where(inArray(olympiads.id, missingFromFile));
  }
  // Missing rows are deliberately retained: a partial crawl must not erase a user's plan.
  return { inserted: rows.filter(r => !oldById.has(r.olympiad.id)).length,
    updated: rows.filter(r => oldById.has(r.olympiad.id)).length, invalidatedStages, missingFromFile,
    hiddenFromCatalog: replaceCatalog ? missingFromFile.length : 0 };
}
