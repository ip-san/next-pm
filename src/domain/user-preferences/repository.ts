import type { AutoWatchTrigger, UserPreferences } from "./entity";

export interface UserPreferencesRepository {
  findByUserId(userId: string): Promise<UserPreferences | null>;
  upsert(userId: string, autoWatchOn: AutoWatchTrigger[]): Promise<void>;
}
