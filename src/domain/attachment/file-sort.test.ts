import { describe, expect, it } from "bun:test";
import type { Attachment } from "./entity";
import { DEFAULT_FILE_SORT, nextSortFor, parseFileSort, sortAttachments } from "./file-sort";

function file(overrides: Partial<Attachment>): Attachment {
  return {
    id: "att",
    containerType: "Project",
    containerId: "project-1",
    authorId: "user-1",
    filename: "a.txt",
    storageKey: "key",
    contentType: "text/plain",
    fileSize: 1,
    digest: "a".repeat(64),
    description: "",
    downloads: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("parseFileSort", () => {
  it("falls back to FilesController's sort_init 'filename', 'asc'", () => {
    expect(parseFileSort(undefined, undefined)).toEqual(DEFAULT_FILE_SORT);
    expect(parseFileSort("created_at", "sideways")).toEqual(DEFAULT_FILE_SORT);
  });

  it("accepts the four sortable columns", () => {
    expect(parseFileSort("downloads", "desc")).toEqual({ column: "downloads", order: "desc" });
  });
});

describe("nextSortFor", () => {
  it("starts a new column at its default order (asc for filename, desc for the rest)", () => {
    expect(nextSortFor({ column: "filename", order: "asc" }, "size")).toEqual({ column: "size", order: "desc" });
    expect(nextSortFor({ column: "size", order: "desc" }, "filename")).toEqual({ column: "filename", order: "asc" });
  });

  it("toggles the order when the column is already active", () => {
    expect(nextSortFor({ column: "size", order: "desc" }, "size")).toEqual({ column: "size", order: "asc" });
  });
});

describe("sortAttachments", () => {
  const files = [
    file({ id: "1", filename: "b.txt", fileSize: 30, downloads: 2, createdAt: new Date("2026-01-03T00:00:00Z") }),
    file({ id: "2", filename: "a.txt", fileSize: 10, downloads: 5, createdAt: new Date("2026-01-02T00:00:00Z") }),
    file({ id: "3", filename: "c.txt", fileSize: 20, downloads: 0, createdAt: new Date("2026-01-01T00:00:00Z") }),
  ];

  it("sorts by filename ascending", () => {
    expect(sortAttachments(files, { column: "filename", order: "asc" }).map((f) => f.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts by size descending", () => {
    expect(sortAttachments(files, { column: "size", order: "desc" }).map((f) => f.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by downloads descending", () => {
    expect(sortAttachments(files, { column: "downloads", order: "desc" }).map((f) => f.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts by date ascending and leaves the input untouched", () => {
    expect(sortAttachments(files, { column: "created_on", order: "asc" }).map((f) => f.id)).toEqual(["3", "2", "1"]);
    expect(files.map((f) => f.id)).toEqual(["1", "2", "3"]);
  });

  it("breaks ties on the filename so the order is stable", () => {
    const tied = [file({ id: "1", filename: "z.txt" }), file({ id: "2", filename: "a.txt" })];
    expect(sortAttachments(tied, { column: "downloads", order: "desc" }).map((f) => f.id)).toEqual(["2", "1"]);
  });
});
