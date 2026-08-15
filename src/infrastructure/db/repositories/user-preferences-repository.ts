import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { userPreferences } from "@/infrastructure/db/schema/user-preferences";
import type { AutoWatchTrigger, UserPreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";

export class DrizzleUserPreferencesRepository implements UserPreferencesRepository {
  async findByUserId(userId: string): Promise<UserPreferences | null> {
    const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    return row ? { userId: row.userId, autoWatchOn: row.autoWatchOn as AutoWatchTrigger[] } : null;
  }

  async upsert(userId: string, autoWatchOn: AutoWatchTrigger[]): Promise<void> {
    await db
      .insert(userPreferences)
      .values({ userId, autoWatchOn })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { autoWatchOn } });
  }
}
