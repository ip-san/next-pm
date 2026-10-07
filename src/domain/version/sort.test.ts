import { describe, expect, it } from "bun:test";
import { compareVersions } from "./sort";

const v = (id: string, name: string, effectiveDate: string | null) => ({ id, name, effectiveDate });

describe("compareVersions", () => {
  it("orders dated versions by date", () => {
    const sorted = [v("1", "b", "2026-03-01"), v("2", "a", "2026-01-01")].sort(compareVersions);
    expect(sorted.map((x) => x.id)).toEqual(["2", "1"]);
  });

  it("puts undated versions after dated ones", () => {
    const sorted = [v("1", "a", null), v("2", "b", "2026-01-01")].sort(compareVersions);
    expect(sorted.map((x) => x.id)).toEqual(["2", "1"]);
  });

  it("falls back to the name, then the id", () => {
    expect(compareVersions(v("1", "a", null), v("2", "b", null))).toBeLessThan(0);
    expect(compareVersions(v("a", "same", "2026-01-01"), v("b", "same", "2026-01-01"))).toBeLessThan(0);
  });
});
