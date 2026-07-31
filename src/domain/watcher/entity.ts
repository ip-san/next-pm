export type WatchableType = "Issue";

export interface Watcher {
  id: string;
  watchableType: WatchableType;
  watchableId: string;
  userId: string;
}
