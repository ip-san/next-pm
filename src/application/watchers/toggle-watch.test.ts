import { describe, expect, it, mock } from "bun:test";
import { toggleWatch } from "./toggle-watch";
import type { WatcherRepository } from "@/domain/watcher/repository";

function makeRepo(isWatching: boolean): WatcherRepository {
  return {
    isWatching: mock(async () => isWatching),
    watch: mock(async () => {}),
    unwatch: mock(async () => {}),
    listWatchedIds: mock(async () => []),
    listWatcherUserIds: mock(async () => []),
  };
}

describe("toggleWatch", () => {
  it("adds a watch when not currently watching", async () => {
    const watcherRepository = makeRepo(false);
    const result = await toggleWatch({ watcherRepository }, "Issue", "issue-1", "user-1");
    expect(result.watching).toBe(true);
    expect(watcherRepository.watch).toHaveBeenCalledWith("Issue", "issue-1", "user-1");
    expect(watcherRepository.unwatch).not.toHaveBeenCalled();
  });

  it("removes a watch when currently watching", async () => {
    const watcherRepository = makeRepo(true);
    const result = await toggleWatch({ watcherRepository }, "Issue", "issue-1", "user-1");
    expect(result.watching).toBe(false);
    expect(watcherRepository.unwatch).toHaveBeenCalledWith("Issue", "issue-1", "user-1");
    expect(watcherRepository.watch).not.toHaveBeenCalled();
  });
});
