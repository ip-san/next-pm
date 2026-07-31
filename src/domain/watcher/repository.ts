import type { WatchableType } from "./entity";

export interface WatcherRepository {
  isWatching(watchableType: WatchableType, watchableId: string, userId: string): Promise<boolean>;
  watch(watchableType: WatchableType, watchableId: string, userId: string): Promise<void>;
  unwatch(watchableType: WatchableType, watchableId: string, userId: string): Promise<void>;
}
