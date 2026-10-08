import type { WatchableType } from "./entity";

export interface WatcherRepository {
  isWatching(watchableType: WatchableType, watchableId: string, userId: string): Promise<boolean>;
  watch(watchableType: WatchableType, watchableId: string, userId: string): Promise<void>;
  unwatch(watchableType: WatchableType, watchableId: string, userId: string): Promise<void>;
  /** Ids of every watchable of `watchableType` this user watches. */
  listWatchedIds(watchableType: WatchableType, userId: string): Promise<string[]>;
  /** User ids currently watching this specific watchable. */
  listWatcherUserIds(watchableType: WatchableType, watchableId: string): Promise<string[]>;
  /** Drops every watcher of one watchable — the watchers table is polymorphic, so nothing cascades. */
  unwatchAll(watchableType: WatchableType, watchableId: string): Promise<void>;
}
