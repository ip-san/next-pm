import { describe, expect, it } from "bun:test";
import { linkedPages, paginate, parsePerPageOptions, resolvePerPage } from "./pagination";

describe("parsePerPageOptions", () => {
  it("parses Redmine's '25,50,100' default", () => {
    expect(parsePerPageOptions(undefined)).toEqual([25, 50, 100]);
  });

  // Setting.per_page_options_array: split on whitespace/commas, drop non-positives, sort.
  it("sorts, de-duplicates and drops non-positive entries", () => {
    expect(parsePerPageOptions("100, 10 ,0,-5,10")).toEqual([10, 100]);
  });

  it("falls back to the default when the setting is empty", () => {
    expect(parsePerPageOptions("")).toEqual([25, 50, 100]);
  });
});

describe("resolvePerPage", () => {
  it("honours a requested size that is one of the options", () => {
    expect(resolvePerPage([25, 50, 100], "50")).toBe(50);
  });

  // Redmine ignores anything not in the configured list rather than trusting the parameter.
  it("falls back to the first option for a size that isn't offered", () => {
    expect(resolvePerPage([25, 50, 100], "999")).toBe(25);
    expect(resolvePerPage([25, 50, 100], "abc")).toBe(25);
    expect(resolvePerPage([25, 50, 100], undefined)).toBe(25);
  });
});

describe("paginate", () => {
  it("computes the window for the first page", () => {
    expect(paginate(60, 25, "1")).toMatchObject({ page: 1, offset: 0, pageCount: 3, firstItem: 1, lastItem: 25 });
  });

  it("computes a partial last page", () => {
    expect(paginate(60, 25, "3")).toMatchObject({ page: 3, offset: 50, firstItem: 51, lastItem: 60 });
  });

  it("clamps a page past the end to the last page", () => {
    expect(paginate(60, 25, "99")).toMatchObject({ page: 3, offset: 50 });
  });

  it("clamps a page below one", () => {
    expect(paginate(60, 25, "0")).toMatchObject({ page: 1, offset: 0 });
    expect(paginate(60, 25, "not-a-number")).toMatchObject({ page: 1, offset: 0 });
  });

  it("reports an empty result as 0 of 0 rather than 1 of 0", () => {
    expect(paginate(0, 25, "1")).toMatchObject({ page: 1, pageCount: 1, firstItem: 0, lastItem: 0 });
  });
});

describe("linkedPages", () => {
  it("returns nothing when everything fits on one page", () => {
    expect(linkedPages(paginate(10, 25, "1"))).toEqual([]);
  });

  // Paginator#linked_pages: first, last, current and the two either side.
  it("links the first, last, current and neighbouring pages", () => {
    expect(linkedPages(paginate(250, 25, "5"))).toEqual([1, 3, 4, 5, 6, 7, 10]);
  });

  it("never links outside the real page range", () => {
    expect(linkedPages(paginate(60, 25, "1"))).toEqual([1, 2, 3]);
  });
});
