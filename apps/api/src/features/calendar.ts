import type { z } from 'zod';
import type { Stage, NextEvent, CalendarState, ScheduleStatus } from '../../../../packages/contracts/src/index.js';
type CalendarStage = z.infer<typeof Stage>;
export function moscowToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(day: string, count: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function stageEvents(stages: CalendarStage[], from: string, through?: string): z.infer<typeof NextEvent>[] {
  const events: z.infer<typeof NextEvent>[] = [];
  for (const stage of stages) {
    if (stage.verification !== 'verified' || !stage.sourceUrl) continue;
    for (const [kind, date] of [['starts', stage.beginsOn], ['ends', stage.endsOn]] as const) {
      if (!date || date < from || (through && date > through)) continue;
      events.push({ stageId: stage.id, name: stage.name, kind, date, timezone: 'Europe/Moscow', sourceUrl: stage.sourceUrl });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'ends' ? -1 : 1) || a.stageId.localeCompare(b.stageId));
}
export function calendarSummary(stages: CalendarStage[], status: z.infer<typeof ScheduleStatus>, today: string) {
  const nextEvent = status === 'not_held' ? null : stageEvents(stages, today)[0] ?? null;
  let calendarState: z.infer<typeof CalendarState>;
  if (status === 'not_held') calendarState = 'not_held';
  else if (stages.some(s => s.verification === 'needs_review')) calendarState = 'needs_review';
  else if (nextEvent) calendarState = 'verified';
  else if (stages.some(s => s.verification === 'verified')) calendarState = 'no_upcoming';
  else if (status === 'published') calendarState = 'unverified';
  else calendarState = 'unknown';
  return { nextEvent, calendarState };
}
