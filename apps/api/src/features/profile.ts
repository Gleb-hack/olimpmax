import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { directions, subjects, universities, userDirections, users, userSubjects, userUniversities } from '../db/schema.js';
import { UserProfile, type ProfilePatch } from '../../../../packages/contracts/src/index.js';

export class ProfileError extends Error {
  constructor(public code: string, message: string, public statusCode: number) { super(message); }
}

export async function readProfile(db: Pick<Database, 'select'>, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new ProfileError('UNAUTHORIZED', 'Войдите в аккаунт заново.', 401);
  const [selected, goalDirections, goalUniversities] = await Promise.all([
    db.select({ id: userSubjects.subjectId }).from(userSubjects).where(eq(userSubjects.userId, id)).orderBy(userSubjects.subjectId),
    db.select({ code: directions.code }).from(userDirections).innerJoin(directions, eq(directions.id, userDirections.directionId))
      .where(eq(userDirections.userId, id)).orderBy(directions.code),
    db.select({ slug: universities.slug }).from(userUniversities).innerJoin(universities, eq(universities.id, userUniversities.universityId))
      .where(eq(userUniversities.userId, id)).orderBy(universities.slug),
  ]);
  return UserProfile.parse({ id: user.id, maxUserId: user.maxUserId,
    avatar: user.avatar, name: user.profileName ?? (user.displayName.trim().slice(0, 80) || 'Ученик'), grade: user.grade, region: user.region,
    subjects: selected.map(s => s.id), online: user.online, onsite: user.onsite,
    directions: goalDirections.map(d => d.code), universities: goalUniversities.map(u => u.slug),
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
    const goalDirections = patch.directions?.length ? await tx.select({ id: directions.id }).from(directions).where(inArray(directions.code, patch.directions)) : [];
    if (patch.directions && goalDirections.length !== patch.directions.length) throw new ProfileError('UNKNOWN_DIRECTION', 'Обновите список направлений и повторите выбор.', 400);
    const goalUniversities = patch.universities?.length ? await tx.select({ id: universities.id }).from(universities).where(inArray(universities.slug, patch.universities)) : [];
    if (patch.universities && goalUniversities.length !== patch.universities.length) throw new ProfileError('UNKNOWN_UNIVERSITY', 'Обновите список вузов и повторите выбор.', 400);
    const { name, subjects: selected, directions: directionCodes, universities: universitySlugs, ...preferences } = patch;
    await tx.update(users).set({ ...preferences, ...(name !== undefined ? { profileName: name } : {}),
      ...(registering ? { registeredAt: now.toISOString() } : {}), updatedAt: now.toISOString() }).where(eq(users.id, id));
    if (selected !== undefined) {
      await tx.delete(userSubjects).where(eq(userSubjects.userId, id));
      if (selected.length) await tx.insert(userSubjects).values(selected.map(subjectId => ({ userId: id, subjectId })));
    }
    if (directionCodes !== undefined) {
      await tx.delete(userDirections).where(eq(userDirections.userId, id));
      if (goalDirections.length) await tx.insert(userDirections).values(goalDirections.map(d => ({ userId: id, directionId: d.id })));
    }
    if (universitySlugs !== undefined) {
      await tx.delete(userUniversities).where(eq(userUniversities.userId, id));
      if (goalUniversities.length) await tx.insert(userUniversities).values(goalUniversities.map(u => ({ userId: id, universityId: u.id })));
    }
    return readProfile(tx, id);
  });
}

// user_subjects, user_directions, user_universities and plan_items are removed by ON DELETE CASCADE in the same statement.
export async function deleteAccount(db: Pick<Database, 'delete'>, id: string) {
  const removed = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (!removed.length) throw new ProfileError('UNAUTHORIZED', 'Войдите в аккаунт заново.', 401);
}
