import { describe, expect, it } from "bun:test";
import { paginate, parsePagination } from "./pagination";

describe("parsePagination", () => {
  it("defaults to offset=0, limit=25 with no query params", () => {
    const pagination = parsePagination(new URL("http://x/issues"));
    expect(pagination).toEqual({ offset: 0, limit: 25 });
  });

  it("parses valid offset/limit query params", () => {
    const pagination = parsePagination(new URL("http://x/issues?offset=10&limit=5"));
    expect(pagination).toEqual({ offset: 10, limit: 5 });
  });

  it("caps limit at 100 even if a larger value is requested", () => {
    const pagination = parsePagination(new URL("http://x/issues?limit=9999"));
    expect(pagination.limit).toBe(100);
  });

  it("falls back to defaults for invalid/negative values", () => {
    const pagination = parsePagination(new URL("http://x/issues?offset=-5&limit=abc"));
    expect(pagination).toEqual({ offset: 0, limit: 25 });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 30 }, (_, i) => i);

  it("slices the array and reports the full total_count", () => {
    const result = paginate(items, { offset: 10, limit: 5 });
    expect(result.items).toEqual([10, 11, 12, 13, 14]);
    expect(result.total_count).toBe(30);
    expect(result.offset).toBe(10);
    expect(result.limit).toBe(5);
  });

  it("returns an empty slice when offset is past the end", () => {
    const result = paginate(items, { offset: 100, limit: 25 });
    expect(result.items).toEqual([]);
    expect(result.total_count).toBe(30);
  });
});
