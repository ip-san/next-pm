import { describe, expect, it, mock } from "bun:test";
import { loadMyPagePreferences } from "./load-preferences";
import { DEFAULT_MY_PAGE_LAYOUT } from "@/domain/my-page/entity";
import type { MyPagePreferences, MyPageRepository } from "@/domain/my-page/repository";

describe("loadMyPagePreferences", () => {
  it("returns the default layout when the user has no saved preferences", async () => {
    const myPageRepository: MyPageRepository = { find: mock(async () => null), save: mock(async () => {}) };
    const prefs = await loadMyPagePreferences(myPageRepository, "user-1");
    expect(prefs).toEqual({ layout: DEFAULT_MY_PAGE_LAYOUT, blockSettings: {} });
  });

  it("returns the stored preferences when present", async () => {
    const stored: MyPagePreferences = { layout: { top: ["news"], left: [], right: [] }, blockSettings: {} };
    const myPageRepository: MyPageRepository = { find: mock(async () => stored), save: mock(async () => {}) };
    const prefs = await loadMyPagePreferences(myPageRepository, "user-1");
    expect(prefs).toBe(stored);
  });
});
