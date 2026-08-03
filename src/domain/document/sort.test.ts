import { describe, expect, it } from "bun:test";
import { groupDocuments } from "./sort";
import type { Document } from "./entity";

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    projectId: "proj-1",
    categoryId: "cat-1",
    title: "Title",
    description: "",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("groupDocuments", () => {
  it("groups by category id", () => {
    const docs = [
      makeDocument({ id: "a", categoryId: "cat-1" }),
      makeDocument({ id: "b", categoryId: "cat-2" }),
      makeDocument({ id: "c", categoryId: "cat-1" }),
    ];
    const groups = groupDocuments(docs, "category", () => null);
    expect(groups.map((g) => g.key)).toEqual(["cat-1", "cat-2"]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("groups by date (YYYY-MM-DD) and sorts groups newest first", () => {
    const docs = [
      makeDocument({ id: "old", createdAt: new Date("2026-07-01T10:00:00Z") }),
      makeDocument({ id: "new", createdAt: new Date("2026-08-01T10:00:00Z") }),
      makeDocument({ id: "new2", createdAt: new Date("2026-08-01T15:00:00Z") }),
    ];
    const groups = groupDocuments(docs, "date", () => null);
    expect(groups.map((g) => g.key)).toEqual(["2026-08-01", "2026-07-01"]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(["new2", "new"]);
  });

  it("groups by the uppercased first character of the title", () => {
    const docs = [makeDocument({ id: "a", title: "apple" }), makeDocument({ id: "b", title: "banana" }), makeDocument({ id: "c", title: "Avocado" })];
    const groups = groupDocuments(docs, "title", () => null);
    expect(groups.map((g) => g.key)).toEqual(["A", "B"]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("groups by the last attachment's author, dropping documents with no attachments", () => {
    const docs = [makeDocument({ id: "a" }), makeDocument({ id: "b" }), makeDocument({ id: "c" })];
    const authorById: Record<string, string | null> = { a: "user-1", b: null, c: "user-1" };
    const groups = groupDocuments(docs, "author", (d) => authorById[d.id]);
    expect(groups.map((g) => g.key)).toEqual(["user-1"]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("returns an empty array for no documents", () => {
    expect(groupDocuments([], "category", () => null)).toEqual([]);
  });

  it("preserves input order within a category/title/author group (no re-sort, unlike date)", () => {
    const docs = [makeDocument({ id: "z", categoryId: "cat-1" }), makeDocument({ id: "a", categoryId: "cat-1" })];
    const groups = groupDocuments(docs, "category", () => null);
    expect(groups[0].documents.map((d) => d.id)).toEqual(["z", "a"]);
  });
});
