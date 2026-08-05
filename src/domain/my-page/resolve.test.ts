import { describe, expect, it } from "bun:test";
import { DEFAULT_MY_PAGE_LAYOUT } from "./entity";
import { resolveMyPagePreferences, resolveTimelogDays } from "./resolve";
import type { MyPagePreferences } from "./repository";

describe("resolveMyPagePreferences", () => {
  it("returns the default layout and empty settings when nothing is stored", () => {
    expect(resolveMyPagePreferences(null)).toEqual({ layout: DEFAULT_MY_PAGE_LAYOUT, blockSettings: {} });
  });

  it("returns the stored preferences unchanged when present", () => {
    const stored: MyPagePreferences = { layout: { top: ["news"], left: [], right: [] }, blockSettings: { timelog: { days: 30 } } };
    expect(resolveMyPagePreferences(stored)).toBe(stored);
  });
});

describe("resolveTimelogDays", () => {
  it("defaults to 7 when unset", () => {
    expect(resolveTimelogDays({})).toBe(7);
  });

  it("uses the stored value when present", () => {
    expect(resolveTimelogDays({ timelog: { days: 30 } })).toBe(30);
  });

  it("clamps below the minimum up to 1", () => {
    expect(resolveTimelogDays({ timelog: { days: 0 } })).toBe(1);
    expect(resolveTimelogDays({ timelog: { days: -5 } })).toBe(1);
  });

  it("clamps above the maximum down to 365", () => {
    expect(resolveTimelogDays({ timelog: { days: 1000 } })).toBe(365);
  });

  it("truncates a non-integer value", () => {
    expect(resolveTimelogDays({ timelog: { days: 14.7 } })).toBe(14);
  });
});
