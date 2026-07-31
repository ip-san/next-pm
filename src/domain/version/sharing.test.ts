import { describe, expect, it } from "bun:test";
import { isVersionSharedWith } from "./sharing";

const root = { id: "root", lft: 1, rgt: 10 };
const child = { id: "child", lft: 2, rgt: 5 };
const grandchild = { id: "grandchild", lft: 3, rgt: 4 };
const sibling = { id: "sibling", lft: 6, rgt: 9 };
const otherRoot = { id: "other-root", lft: 11, rgt: 12 };

describe("isVersionSharedWith", () => {
  it("is always shared with the owning project itself, regardless of sharing value", () => {
    expect(isVersionSharedWith(child, child, "none", root, root)).toBe(true);
  });

  describe("none", () => {
    it("is not shared with any other project", () => {
      expect(isVersionSharedWith(child, grandchild, "none", root, root)).toBe(false);
      expect(isVersionSharedWith(child, root, "none", root, root)).toBe(false);
    });
  });

  describe("descendants", () => {
    it("is shared with descendants of the owning project", () => {
      expect(isVersionSharedWith(child, grandchild, "descendants", root, root)).toBe(true);
    });

    it("is not shared with siblings or ancestors", () => {
      expect(isVersionSharedWith(child, sibling, "descendants", root, root)).toBe(false);
      expect(isVersionSharedWith(child, root, "descendants", root, root)).toBe(false);
    });
  });

  describe("hierarchy", () => {
    it("is shared with both descendants and ancestors of the owning project", () => {
      expect(isVersionSharedWith(child, grandchild, "hierarchy", root, root)).toBe(true);
      expect(isVersionSharedWith(child, root, "hierarchy", root, root)).toBe(true);
    });

    it("is not shared with siblings", () => {
      expect(isVersionSharedWith(child, sibling, "hierarchy", root, root)).toBe(false);
    });
  });

  describe("tree", () => {
    it("is shared with any project under the same tree root", () => {
      expect(isVersionSharedWith(child, sibling, "tree", root, root)).toBe(true);
      expect(isVersionSharedWith(child, grandchild, "tree", root, root)).toBe(true);
    });

    it("is not shared with a project in a different tree", () => {
      expect(isVersionSharedWith(child, otherRoot, "tree", root, otherRoot)).toBe(false);
    });
  });

  describe("system", () => {
    it("is shared with every project, even in a different tree", () => {
      expect(isVersionSharedWith(child, otherRoot, "system", root, otherRoot)).toBe(true);
    });
  });
});
