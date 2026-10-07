import { describe, expect, it } from "bun:test";
import { issueIndentLevels } from "./tree";

function levelsOf(issues: { id: string; parentId: string | null }[]) {
  return issueIndentLevels(issues, new Map(issues.map((issue) => [issue.id, issue.parentId])));
}

describe("issueIndentLevels", () => {
  it("leaves a flat list at level 0", () => {
    const levels = levelsOf([
      { id: "a", parentId: null },
      { id: "b", parentId: null },
    ]);
    expect([...levels.values()]).toEqual([0, 0]);
  });

  it("indents a child under its parent", () => {
    const levels = levelsOf([
      { id: "parent", parentId: null },
      { id: "child", parentId: "parent" },
    ]);
    expect(levels.get("child")).toBe(1);
  });

  it("indents deeper for a grandchild", () => {
    const levels = levelsOf([
      { id: "root", parentId: null },
      { id: "mid", parentId: "root" },
      { id: "leaf", parentId: "mid" },
    ]);
    expect([levels.get("root"), levels.get("mid"), levels.get("leaf")]).toEqual([0, 1, 2]);
  });

  it("pops back out when the next issue is not a descendant", () => {
    const levels = levelsOf([
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
      { id: "sibling-of-root", parentId: null },
    ]);
    expect(levels.get("sibling-of-root")).toBe(0);
  });

  it("keeps an issue at level 0 when its parent is not in the list", () => {
    // Redmine indents relative to what the list contains, so a child whose parent was
    // filtered out or left on another page doesn't claim a depth the reader can't see.
    const levels = levelsOf([{ id: "orphan-in-list", parentId: "parent-elsewhere" }]);
    expect(levels.get("orphan-in-list")).toBe(0);
  });

  it("returns to the right depth after a deeper branch ends", () => {
    const levels = levelsOf([
      { id: "root", parentId: null },
      { id: "a", parentId: "root" },
      { id: "a1", parentId: "a" },
      { id: "b", parentId: "root" },
    ]);
    expect(levels.get("b")).toBe(1);
  });

  it("terminates on a cycle left behind by older data", () => {
    const issues = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect(() => levelsOf(issues)).not.toThrow();
  });
});
