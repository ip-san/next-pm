import { describe, expect, it, mock } from "bun:test";
import { loadCommitKeywordSettings, updateCommitKeywordSettings } from "./commit-keyword-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

function makeSettingsRepository(initial: Record<string, string> = {}): SettingsRepository {
  const store = { ...initial };
  return {
    getAll: mock(async () => ({ ...store })),
    setMany: mock(async (values) => {
      Object.assign(store, values);
    }),
  };
}

describe("loadCommitKeywordSettings", () => {
  it("resolves defaults when the settings table is empty", async () => {
    const settings = await loadCommitKeywordSettings(makeSettingsRepository());
    expect(settings.keywordScanOptions.refKeywords).toEqual(["refs", "references"]);
    expect(settings.logtimeEnabled).toBe(true);
  });

  it("resolves persisted overrides", async () => {
    const settings = await loadCommitKeywordSettings(
      makeSettingsRepository({ commit_ref_keywords: "*", commit_logtime_enabled: "0" }),
    );
    expect(settings.keywordScanOptions.refKeywords).toEqual(["*"]);
    expect(settings.logtimeEnabled).toBe(false);
  });
});

describe("updateCommitKeywordSettings", () => {
  it("persists the given keyword lists and flag, then round-trips through loadCommitKeywordSettings", async () => {
    const settingsRepository = makeSettingsRepository();

    await updateCommitKeywordSettings(settingsRepository, {
      refKeywords: ["refs", "see"],
      fixKeywords: ["fixes"],
      logtimeEnabled: false,
    });

    expect(settingsRepository.setMany).toHaveBeenCalledWith({
      commit_ref_keywords: "refs,see",
      commit_update_keywords: "fixes",
      commit_logtime_enabled: "0",
    });

    const settings = await loadCommitKeywordSettings(settingsRepository);
    expect(settings.keywordScanOptions.refKeywords).toEqual(["refs", "see"]);
    expect(settings.keywordScanOptions.fixKeywords).toEqual(["fixes"]);
    expect(settings.logtimeEnabled).toBe(false);
  });
});
