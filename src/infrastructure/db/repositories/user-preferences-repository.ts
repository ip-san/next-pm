import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { userPreferences } from "@/infrastructure/db/schema/user-preferences";
import type { AutoWatchTrigger, UserPreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";

function toDomain(row: typeof userPreferences.$inferSelect): UserPreferences {
  return {
    userId: row.userId,
    autoWatchOn: row.autoWatchOn as AutoWatchTrigger[],
    hideMail: row.hideMail,
    timeZone: row.timeZone,
    commentsSorting: row.commentsSorting,
    noSelfNotified: row.noSelfNotified,
  };
}

export class DrizzleUserPreferencesRepository implements UserPreferencesRepository {
  async findByUserId(userId: string): Promise<UserPreferences | null> {
    const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByUserIds(userIds: string[]): Promise<UserPreferences[]> {
    if (userIds.length === 0) return [];
    const rows = await db.select().from(userPreferences).where(inArray(userPreferences.userId, userIds));
    return rows.map(toDomain);
  }

  async upsert(userId: string, autoWatchOn: AutoWatchTrigger[]): Promise<void> {
    await db
      .insert(userPreferences)
      .values({ userId, autoWatchOn })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { autoWatchOn } });
  }

  /** The my-account form's half: everything except autoWatchOn, which has its own screen. */
  async upsertAccountPreferences(
    userId: string,
    values: Pick<UserPreferences, "hideMail" | "timeZone" | "commentsSorting" | "noSelfNotified">,
  ): Promise<void> {
    await db
      .insert(userPreferences)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userPreferences.userId, set: values });
  }
}
