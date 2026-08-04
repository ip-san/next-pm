import { describe, expect, it } from "bun:test";
import { archivedWikiPageFilename, sanitizeWikiPageFilename, sortWikiPagesForExport } from "./export";
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

describe("sanitizeWikiPageFilename", () => {
  it("leaves an ordinary title untouched", () => {
    expect(sanitizeWikiPageFilename("Getting Started")).toBe("Getting Started");
  });

  it("collapses a run of unsafe characters into a single underscore", () => {
    expect(sanitizeWikiPageFilename("A/B")).toBe("A_B");
    expect(sanitizeWikiPageFilename("A///B")).toBe("A_B");
  });

  it("replaces backslashes with underscores", () => {
    expect(sanitizeWikiPageFilename("A\\B")).toBe("A_B");
  });

  it("neutralizes a path-traversal-shaped title into a single flat filename", () => {
    const sanitized = sanitizeWikiPageFilename("../../etc/passwd");
    expect(sanitized).not.toContain("/");
    expect(sanitized).not.toContain("\\");
    expect(sanitized).toBe(".._.._etc_passwd");
  });

  it("strips each of Redmine's listed unsafe characters", () => {
    expect(sanitizeWikiPageFilename(`a?b%c*d:e|f"g'h<i>j`)).toBe("a_b_c_d_e_f_g_h_i_j");
  });
});

describe("archivedWikiPageFilename", () => {
  it("appends the .txt extension", () => {
    const used = new Set<string>();
    expect(archivedWikiPageFilename("Home", used)).toBe("Home.txt");
  });

  it("disambiguates a duplicate sanitized filename with (N)", () => {
    const used = new Set<string>();
    expect(archivedWikiPageFilename("A/B", used)).toBe("A_B.txt");
    expect(archivedWikiPageFilename("A?B", used)).toBe("A_B(1).txt");
    expect(archivedWikiPageFilename("A:B", used)).toBe("A_B(2).txt");
  });

  it("mutates the shared set so a later call sees earlier entries", () => {
    const used = new Set<string>();
    archivedWikiPageFilename("Home", used);
    expect(used.has("Home.txt")).toBe(true);
  });

  it("never lets a traversal-shaped title produce a nested path entry", () => {
    const used = new Set<string>();
    const filename = archivedWikiPageFilename("../../etc/passwd", used);
    expect(filename).toBe(".._.._etc_passwd.txt");
    expect(filename.split("/")).toHaveLength(1);
  });
});
