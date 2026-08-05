import { describe, expect, it } from "bun:test";
import { buildTreeEntries } from "./build-tree-entries";

const FILES = ["README.md", "sub/file.txt", "sub/nested/deep.txt", "sub2/other.txt"];

describe("buildTreeEntries", () => {
  it("returns root-level files and directories, not recursing into subdirectories", () => {
    const entries = buildTreeEntries(FILES, "");
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "README.md", path: "README.md", kind: "blob" },
        { name: "sub", path: "sub", kind: "tree" },
        { name: "sub2", path: "sub2", kind: "tree" },
      ]),
    );
    expect(entries).toHaveLength(3);
  });

  it("returns the immediate children of a subdirectory", () => {
    const entries = buildTreeEntries(FILES, "sub");
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: "file.txt", path: "sub/file.txt", kind: "blob" },
        { name: "nested", path: "sub/nested", kind: "tree" },
      ]),
    );
    expect(entries).toHaveLength(2);
  });

  it("deduplicates a directory that appears via multiple files inside it", () => {
    const entries = buildTreeEntries(["a/one.txt", "a/two.txt"], "");
    expect(entries).toEqual([{ name: "a", path: "a", kind: "tree" }]);
  });

  it("returns an empty array for a path with no matching files", () => {
    expect(buildTreeEntries(FILES, "nonexistent")).toEqual([]);
  });
});
