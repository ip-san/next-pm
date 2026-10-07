import { describe, expect, it, mock } from "bun:test";
import { applyAutoWatch } from "./apply-auto-watch";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";

function makeRepos(preferences: UserPreferences | null) {
  const watch = mock(async () => {});
  const userPreferencesRepository: UserPreferencesRepository = {
    findByUserId: mock(async () => preferences),
    findByUserIds: mock(async () => []),
    upsertAccountPreferences: mock(async () => {}),
    upsert: mock(async () => {}),
  };
  const watcherRepository: WatcherRepository = {
    isWatching: mock(async () => false),
    watch,
    unwatch: mock(async () => {}),
    listWatchedIds: mock(async () => []),
    listWatcherUserIds: mock(async () => []),
  };
  return { userPreferencesRepository, watcherRepository, watch };
}

describe("applyAutoWatch", () => {
  it("watches when the user has no stored preferences yet (defaults to all triggers enabled)", async () => {
    const { userPreferencesRepository, watcherRepository, watch } = makeRepos(null);
    await applyAutoWatch({ userPreferencesRepository, watcherRepository }, "issue_created", "Issue", "issue-1", "user-1");
    expect(watch).toHaveBeenCalledWith("Issue", "issue-1", "user-1");
  });

  it("watches when the trigger is explicitly enabled in the user's preferences", async () => {
    const { userPreferencesRepository, watcherRepository, watch } = makeRepos({ userId: "user-1", ...DEFAULT_USER_PREFERENCES, autoWatchOn: ["issue_assigned_to_me"] });
    await applyAutoWatch({ userPreferencesRepository, watcherRepository }, "issue_assigned_to_me", "Issue", "issue-1", "user-1");
    expect(watch).toHaveBeenCalledWith("Issue", "issue-1", "user-1");
  });

  it("does not watch when the trigger is disabled in the user's preferences", async () => {
    const { userPreferencesRepository, watcherRepository, watch } = makeRepos({ userId: "user-1", ...DEFAULT_USER_PREFERENCES, autoWatchOn: ["issue_assigned_to_me"] });
    await applyAutoWatch({ userPreferencesRepository, watcherRepository }, "issue_created", "Issue", "issue-1", "user-1");
    expect(watch).not.toHaveBeenCalled();
  });

  it("does not watch when the user has explicitly disabled every trigger", async () => {
    const { userPreferencesRepository, watcherRepository, watch } = makeRepos({ userId: "user-1", ...DEFAULT_USER_PREFERENCES, autoWatchOn: [] });
    await applyAutoWatch({ userPreferencesRepository, watcherRepository }, "issue_created", "Issue", "issue-1", "user-1");
    expect(watch).not.toHaveBeenCalled();
  });
});
