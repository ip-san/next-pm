export type WatchableType = "Issue" | "News" | "Message" | "WikiPage";

export interface Watcher {
  id: string;
  watchableType: WatchableType;
  watchableId: string;
  userId: string;
}
