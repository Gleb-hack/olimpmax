import { and, eq, desc } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { olympiads, planItems } from '../db/schema.js';
import { enrich } from './catalog.js';
import { addDays, moscowToday, stageEvents } from './calendar.js';
export const planKey = (userId: string, olympiadId: number) => and(eq(planItems.userId, userId), eq(planItems.olympiadId, olympiadId));
export async function readPlan(db: Database, userId: string, today = moscowToday()) {
  const rows = await db.select({ olympiad: olympiads, plan: planItems }).from(planItems)
    .innerJoin(olympiads, eq(planItems.olympiadId, olympiads.id)).where(eq(planItems.userId, userId)).orderBy(desc(planItems.savedAt), planItems.olympiadId);
  const enriched = await enrich(db, rows.map(r => r.olympiad), today);
  const items = enriched.map((r, i) => ({ olympiad: r.card, tracking: rows[i]!.plan.tracking,
    note: rows[i]!.plan.note, savedAt: rows[i]!.plan.savedAt, stages: r.stages, calendarRaw: r.row.calendarRaw }));
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
