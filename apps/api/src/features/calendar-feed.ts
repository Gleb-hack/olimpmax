// The plan calendar for phone calendars: a secret link per user (/calendar/<token>.ics) that a calendar app subscribes to.
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { buildIcs } from '../../../../packages/contracts/src/index.js';
import { readPlan } from './plan.js';

const feedPath = (token: string) => `/calendar/${token}.ics`;

/** The user's feed link; created on first use. `reset` replaces the token, so every old subscription stops updating. */
export async function calendarFeedLink(db: Database, userId: string, reset = false) {
  if (!reset) {
    const [row] = await db.select({ token: users.calendarToken }).from(users).where(eq(users.id, userId));
    if (row?.token) return { path: feedPath(row.token) };
  }
  const token = randomBytes(32).toString('base64url');
  await db.update(users).set({ calendarToken: token }).where(eq(users.id, userId));
  return { path: feedPath(token) };
}

/** The feed itself: stages of the tracked plan olympiads, as the plan calendar shows them. Null — unknown token. */
export async function calendarFeed(db: Database, token: string, today: string, now: Date) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.calendarToken, token));
  if (!user) return null;
  const plan = await readPlan(db, user.id, today);
  return buildIcs(plan.items.filter(item => item.tracking).map(item => ({
    olympiadId: item.olympiad.id, title: item.olympiad.title, url: item.olympiad.sourceUrl, events: item.calendarEvents ?? [],
  })), { now });
}
