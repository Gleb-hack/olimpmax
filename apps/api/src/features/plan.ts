import { and, eq, desc } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/client.js';
import { olympiads, planItems, planStageResults } from '../db/schema.js';
import type { PlanPatch } from '../../../../packages/contracts/src/index.js';
import { enrich } from './catalog.js';
import { addDays, moscowToday, stageEvents } from './calendar.js';
export const planKey = (userId: string, olympiadId: number) => and(eq(planItems.userId, userId), eq(planItems.olympiadId, olympiadId));
export async function readPlan(db: Database, userId: string, today = moscowToday()) {
  const rows = await db.select({ olympiad: olympiads, plan: planItems }).from(planItems)
    .innerJoin(olympiads, eq(planItems.olympiadId, olympiads.id)).where(eq(planItems.userId, userId)).orderBy(desc(planItems.savedAt), planItems.olympiadId);
  const [enriched, resultRows] = await Promise.all([enrich(db, rows.map(r => r.olympiad), today),
    db.select().from(planStageResults).where(eq(planStageResults.userId, userId)).orderBy(planStageResults.updatedAt, planStageResults.stage)]);
  const results = new Map<number, { stage: string; result: typeof resultRows[number]['result'] }[]>();
  for (const r of resultRows) results.set(r.olympiadId, [...results.get(r.olympiadId) ?? [], { stage: r.stage, result: r.result }]);
  const items = enriched.map((r, i) => ({ olympiad: r.card, tracking: rows[i]!.plan.tracking,
    note: rows[i]!.plan.note, savedAt: rows[i]!.plan.savedAt, status: rows[i]!.plan.status, results: results.get(r.card.id) ?? [],
    stages: r.stages, calendarRaw: r.card.calendarRaw ?? null, calendarEvents: r.events() }));
  items.sort((a, b) => (a.tracking ? a.olympiad.nextEvent?.date ?? '9999' : '9999').localeCompare(b.tracking ? b.olympiad.nextEvent?.date ?? '9999' : '9999'));
  return { items, total: items.length };
}
export async function planEvents(db: Database, userId: string, days: number, from = moscowToday()) {
  const through = addDays(from, days - 1);
  const plan = await readPlan(db, userId, from);
  const items = plan.items.filter(p => p.tracking && p.olympiad.scheduleStatus !== 'not_held').flatMap(p =>
    stageEvents(p.stages, from, through).map(event => ({ ...event, olympiadId: p.olympiad.id, olympiadTitle: p.olympiad.title })));
  items.sort((a, b) => a.date.localeCompare(b.date) || a.olympiadId - b.olympiadId || a.stageId.localeCompare(b.stageId) || a.kind.localeCompare(b.kind));
  return { from, through, items };
}

/** Tracking, note, status and stage results of one plan olympiad in one transaction; false — it is not in the plan. */
export async function patchPlanItem(db: Database, userId: string, olympiadId: number, patch: z.infer<typeof PlanPatch>) {
  const { results, ...fields } = patch;
  return db.transaction(async tx => {
    const changed = Object.keys(fields).length
      ? await tx.update(planItems).set(fields).where(planKey(userId, olympiadId)).returning({ id: planItems.olympiadId })
      : await tx.select({ id: planItems.olympiadId }).from(planItems).where(planKey(userId, olympiadId)).for('update');
    if (!changed.length) return false;
    if (results) {
      await tx.delete(planStageResults).where(and(eq(planStageResults.userId, userId), eq(planStageResults.olympiadId, olympiadId)));
      if (results.length) await tx.insert(planStageResults).values(results.map(r => ({ userId, olympiadId, stage: r.stage.trim(), result: r.result })));
    }
    return true;
  });
}
