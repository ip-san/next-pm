import { describe, expect, it } from "bun:test";
import { parseKeywordList, resolveCommitKeywordSettings, serializeKeywordList } from "./commit-keywords";

describe("parseKeywordList", () => {
  it("splits on commas, trims whitespace, and drops empty entries", () => {
    expect(parseKeywordList(" refs , references ,,")).toEqual(["refs", "references"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseKeywordList("")).toEqual([]);
  });
});

describe("serializeKeywordList", () => {
  it("joins keywords with commas", () => {
    expect(serializeKeywordList(["refs", "references"])).toBe("refs,references");
  });
});

describe("resolveCommitKeywordSettings", () => {
  it("falls back to defaults when no overrides are stored", () => {
    const settings = resolveCommitKeywordSettings({});
    expect(settings.keywordScanOptions.refKeywords).toEqual(["refs", "references"]);
    expect(settings.keywordScanOptions.fixKeywords).toEqual(["fixes", "closes", "fix", "close"]);
    expect(settings.logtimeEnabled).toBe(true);
  });

  it("uses persisted overrides where present", () => {
    const settings = resolveCommitKeywordSettings({
      commit_ref_keywords: "*",
      commit_update_keywords: "resolves",
      commit_logtime_enabled: "0",
    });
    expect(settings.keywordScanOptions.refKeywords).toEqual(["*"]);
    expect(settings.keywordScanOptions.fixKeywords).toEqual(["resolves"]);
    expect(settings.logtimeEnabled).toBe(false);
  });

  it("falls back to the default for any single key left unset", () => {
    const settings = resolveCommitKeywordSettings({ commit_logtime_enabled: "0" });
    expect(settings.keywordScanOptions.refKeywords).toEqual(["refs", "references"]);
    expect(settings.logtimeEnabled).toBe(false);
  });

  it("treats any value other than the literal \"1\" as disabled", () => {
    expect(resolveCommitKeywordSettings({ commit_logtime_enabled: "0" }).logtimeEnabled).toBe(false);
    expect(resolveCommitKeywordSettings({ commit_logtime_enabled: "" }).logtimeEnabled).toBe(false);
    expect(resolveCommitKeywordSettings({ commit_logtime_enabled: "true" }).logtimeEnabled).toBe(false);
  });
});
