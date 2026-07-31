import type { WatchableType } from "@/domain/watcher/entity";
import type { WatcherRepository } from "@/domain/watcher/repository";

/**
 * Self-watch add/remove — mirrors Redmine's own behavior where a user toggling their own watch
 * on an object they can already view needs no separate add_*_watchers/delete_*_watchers
 * permission (those permissions only gate managing *other* users' watches).
 */
export async function toggleWatch(
  repositories: { watcherRepository: WatcherRepository },
  watchableType: WatchableType,
  watchableId: string,
  userId: string,
): Promise<{ watching: boolean }> {
  const isWatching = await repositories.watcherRepository.isWatching(watchableType, watchableId, userId);
  if (isWatching) {
    await repositories.watcherRepository.unwatch(watchableType, watchableId, userId);
    return { watching: false };
  }
  await repositories.watcherRepository.watch(watchableType, watchableId, userId);
  return { watching: true };
}
