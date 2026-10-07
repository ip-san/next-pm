import { describe, expect, it } from "bun:test";
import {
  ancestorChain,
  buildWikiPageTree,
  childrenOf,
  descendantIds,
  selfAndDescendantIds,
  wouldCreateParentCycle,
} from "./hierarchy";

// root
//  ├── a
//  │    └── a1
//  └── b
// orphan (no parent)
const pages = [
  { id: "root", parentId: null },
  { id: "a", parentId: "root" },
  { id: "a1", parentId: "a" },
  { id: "b", parentId: "root" },
  { id: "orphan", parentId: null },
];

describe("childrenOf", () => {
  it("returns direct children only", () => {
    expect(childrenOf(pages, "root").map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("returns the roots for a null parent", () => {
    expect(childrenOf(pages, null).map((p) => p.id)).toEqual(["root", "orphan"]);
  });
});

describe("descendantIds", () => {
  it("collects the whole subtree below a page", () => {
    expect([...descendantIds(pages, "root")].sort()).toEqual(["a", "a1", "b"]);
  });

  it("is empty for a leaf", () => {
    expect([...descendantIds(pages, "a1")]).toEqual([]);
  });

  it("terminates on a pre-existing parent loop in the data", () => {
    const looped = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect([...descendantIds(looped, "x")].sort()).toEqual(["y"]);
  });
});

describe("selfAndDescendantIds", () => {
  it("includes the page itself", () => {
    expect([...selfAndDescendantIds(pages, "a")].sort()).toEqual(["a", "a1"]);
  });
});

describe("wouldCreateParentCycle", () => {
  it("rejects making a page its own parent", () => {
    expect(wouldCreateParentCycle(pages, "a", "a")).toBe(true);
  });

  it("rejects moving a page under its own descendant", () => {
    expect(wouldCreateParentCycle(pages, "a", "a1")).toBe(true);
  });

  it("allows moving a page under an unrelated page", () => {
    expect(wouldCreateParentCycle(pages, "a", "orphan")).toBe(false);
  });
});

describe("ancestorChain", () => {
  it("lists ancestors from the root down", () => {
    expect(ancestorChain(pages, { id: "a1", parentId: "a" }).map((p) => p.id)).toEqual(["root", "a"]);
  });

  it("is empty for a root page", () => {
    expect(ancestorChain(pages, { id: "root", parentId: null })).toEqual([]);
  });

  it("stops instead of hanging on a looping parent chain", () => {
    const looped = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect(ancestorChain(looped, looped[0]).map((p) => p.id)).toEqual(["y"]);
  });
});

describe("buildWikiPageTree", () => {
  it("nests children under their parents and keeps roots in order", () => {
    const tree = buildWikiPageTree(pages);
    expect(tree.map((node) => node.page.id)).toEqual(["root", "orphan"]);
    expect(tree[0].children.map((node) => node.page.id)).toEqual(["a", "b"]);
    expect(tree[0].children[0].children.map((node) => node.page.id)).toEqual(["a1"]);
  });

  it("treats a page whose parent is not in the list as a root", () => {
    const tree = buildWikiPageTree([{ id: "a1", parentId: "a" }]);
    expect(tree.map((node) => node.page.id)).toEqual(["a1"]);
  });
});
