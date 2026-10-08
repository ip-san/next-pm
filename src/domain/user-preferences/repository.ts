import type { AutoWatchTrigger, UserPreferences } from "./entity";

export interface UserPreferencesRepository {
  findByUserId(userId: string): Promise<UserPreferences | null>;
  /** Batch read for the notification job, which needs every recipient's preferences at once. */
  findByUserIds(userIds: string[]): Promise<UserPreferences[]>;
  upsert(userId: string, autoWatchOn: AutoWatchTrigger[]): Promise<void>;
  upsertAccountPreferences(
    userId: string,
    values: Pick<UserPreferences, "hideMail" | "timeZone" | "commentsSorting" | "noSelfNotified">,
  ): Promise<void>;
}
