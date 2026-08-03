import { describe, expect, it } from "bun:test";
import { sortWikiPagesForExport } from "./export";
import type { WikiPage } from "./entity";

function makePage(overrides: Partial<WikiPage> = {}): WikiPage {
  return { id: "page-1", projectId: "proj-1", title: "Title", parentId: null, isProtected: false, ...overrides };
}

describe("sortWikiPagesForExport", () => {
  it("sorts pages alphabetically by title", () => {
    const pages = [makePage({ id: "c", title: "Cherry" }), makePage({ id: "a", title: "Apple" }), makePage({ id: "b", title: "Banana" })];
    expect(sortWikiPagesForExport(pages).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const pages = [makePage({ id: "b", title: "Banana" }), makePage({ id: "a", title: "Apple" })];
    const original = [...pages];
    sortWikiPagesForExport(pages);
    expect(pages).toEqual(original);
  });

  it("returns an empty array for no pages", () => {
    expect(sortWikiPagesForExport([])).toEqual([]);
  });
});
