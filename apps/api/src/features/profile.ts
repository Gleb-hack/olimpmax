import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { subjects, users, userSubjects } from '../db/schema.js';
import { UserProfile, type ProfilePatch } from '../../../../packages/contracts/src/index.js';

export class ProfileError extends Error {
  constructor(public code: string, message: string, public statusCode: number) { super(message); }
}

export async function readProfile(db: Pick<Database, 'select'>, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new ProfileError('UNAUTHORIZED', 'Войдите в аккаунт заново.', 401);
  const selected = await db.select({ id: userSubjects.subjectId }).from(userSubjects).where(eq(userSubjects.userId, id)).orderBy(userSubjects.subjectId);
  return UserProfile.parse({ id: user.id, maxUserId: user.maxUserId,
    name: user.profileName ?? (user.displayName.trim().slice(0, 80) || 'Ученик'), grade: user.grade, region: user.region,
    subjects: selected.map(s => s.id), online: user.online, onsite: user.onsite,
    registeredAt: user.registeredAt, createdAt: user.createdAt });
}

export async function saveProfile(db: Database, id: string, patch: ProfilePatch, registering: boolean, now: Date) {
  return db.transaction(async tx => {
    // Serialize registration and preference changes, including the subject relation.
    const [current] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!current) throw new ProfileError('UNAUTHORIZED', 'Войдите в аккаунт заново.', 401);
    if (registering && current.registeredAt) throw new ProfileError('ALREADY_REGISTERED', 'Профиль уже существует. Перейдите на вкладку «Вход».', 409);
    if (!registering && !current.registeredAt) throw new ProfileError('REGISTRATION_REQUIRED', 'Сначала завершите регистрацию.', 409);
    if (patch.subjects?.length) {
      const found = await tx.select({ id: subjects.id }).from(subjects).where(inArray(subjects.id, patch.subjects));
      if (found.length !== patch.subjects.length) throw new ProfileError('UNKNOWN_SUBJECT', 'Обновите список предметов и повторите выбор.', 400);
    }
    const { name, subjects: selected, ...preferences } = patch;
    await tx.update(users).set({ ...preferences, ...(name !== undefined ? { profileName: name } : {}),
      ...(registering ? { registeredAt: now.toISOString() } : {}), updatedAt: now.toISOString() }).where(eq(users.id, id));
    if (selected !== undefined) {
      await tx.delete(userSubjects).where(eq(userSubjects.userId, id));
      if (selected.length) await tx.insert(userSubjects).values(selected.map(subjectId => ({ userId: id, subjectId })));
    }
    return readProfile(tx, id);
  });
}
