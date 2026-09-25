import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { olympiads, planItems, subjects, users } from '../db/schema.js';
import { readProfile, ProfileError } from './profile.js';
import { AccountExport, exportNotStored, type ExportDevice } from '../../../../packages/contracts/src/index.js';

export async function buildExport(db: Database, userId: string, device: ExportDevice, now: Date) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new ProfileError('UNAUTHORIZED', 'Войдите в аккаунт заново.', 401);
  const profile = await readProfile(db, userId);
  const names = profile.subjects.length ? await db.select().from(subjects).where(inArray(subjects.id, profile.subjects)).orderBy(subjects.id) : [];
  const plan = await db.select({ olympiadId: planItems.olympiadId, title: olympiads.title, sourceUrl: olympiads.sourceUrl,
    tracking: planItems.tracking, note: planItems.note, savedAt: planItems.savedAt })
    .from(planItems).innerJoin(olympiads, eq(planItems.olympiadId, olympiads.id))
    .where(eq(planItems.userId, userId)).orderBy(planItems.savedAt, planItems.olympiadId);
  return AccountExport.parse({ format: 'olimpmax-export', version: 1, exportedAt: now.toISOString(),
    account: { id: user.id, maxUserId: user.maxUserId, maxDisplayName: user.displayName, createdAt: user.createdAt, registeredAt: user.registeredAt, updatedAt: user.updatedAt },
    profile: { name: profile.name, grade: profile.grade, region: profile.region, subjects: names, online: profile.online, onsite: profile.onsite },
    plan, device, notStored: exportNotStored });
}

// MAX downloads files only by an HTTPS URL without our Authorization header, so a prepared file
// is kept briefly in memory behind an unguessable link. It never reaches the database or logs.
export function exportFiles(ttlMs: number, now: () => number, limit = 50) {
  const files = new Map<string, { userId: string; body: string; fileName: string; expires: number }>();
  const sweep = () => { for (const [token, file] of files) if (file.expires <= now()) files.delete(token); };
  return {
    put(userId: string, body: string, fileName: string) {
      sweep();
      for (const [token, file] of files) if (file.userId === userId) files.delete(token);
      while (files.size >= limit) files.delete(files.keys().next().value!);
      const token = randomBytes(32).toString('base64url');
      files.set(token, { userId, body, fileName, expires: now() + ttlMs });
      return token;
    },
    get(token: string) {
      const file = files.get(token);
      if (!file || file.expires <= now()) { files.delete(token); return null; }
      return file;
    },
    dropUser(userId: string) { for (const [token, file] of files) if (file.userId === userId) files.delete(token); },
  };
}
