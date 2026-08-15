import type { WatchableType } from "@/domain/watcher/entity";
import type { WatcherRepository } from "@/domain/watcher/repository";
import { resolveAutoWatchOn, type AutoWatchTrigger } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";

/**
 * Mirrors Redmine's Issue#after_save auto-watch callbacks: if `userId`'s own preference has
 * `trigger` enabled, they start watching `watchableId` — a no-op if they already are, since
 * WatcherRepository.watch() is itself idempotent (ON CONFLICT DO NOTHING).
 */
export async function applyAutoWatch(
  repositories: { userPreferencesRepository: UserPreferencesRepository; watcherRepository: WatcherRepository },
  trigger: AutoWatchTrigger,
  watchableType: WatchableType,
  watchableId: string,
  userId: string,
): Promise<void> {
  const preferences = await repositories.userPreferencesRepository.findByUserId(userId);
  if (resolveAutoWatchOn(preferences).includes(trigger)) {
    await repositories.watcherRepository.watch(watchableType, watchableId, userId);
  }
}
