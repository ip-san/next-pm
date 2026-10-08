import { describe, expect, it } from "bun:test";
import { isWithinSubtree, planDelete, planInsert, subtreeScopes, type NestedSetNode } from "./nested-set";

describe("nested-set planInsert", () => {
  it("places the first root at lft=1, rgt=2", () => {
    const plan = planInsert([], null);
    expect(plan.newNode).toEqual({ lft: 1, rgt: 2 });
    expect(plan.shifted).toEqual([]);
  });

  it("appends a second root after the first, without shifting it", () => {
    const first: NestedSetNode = { id: "a", lft: 1, rgt: 2 };
    const plan = planInsert([first], null);
    expect(plan.newNode).toEqual({ lft: 3, rgt: 4 });
    expect(plan.shifted).toEqual([first]);
  });

  it("inserts a child as the rightmost child of its parent, shifting later siblings", () => {
    // Tree: root(1,6) > childA(2,3), childB(4,5)
    const root: NestedSetNode = { id: "root", lft: 1, rgt: 6 };
    const childA: NestedSetNode = { id: "a", lft: 2, rgt: 3 };
    const childB: NestedSetNode = { id: "b", lft: 4, rgt: 5 };

    const plan = planInsert([root, childA, childB], root);

    // New child inserted at the old root.rgt (6), everything >= 6 shifts by +2.
    expect(plan.newNode).toEqual({ lft: 6, rgt: 7 });
    expect(plan.shifted).toEqual([
      { id: "root", lft: 1, rgt: 8 },
      { id: "a", lft: 2, rgt: 3 },
      { id: "b", lft: 4, rgt: 5 },
    ]);
  });

  it("shifts unrelated sibling subtrees that fall after the insertion point", () => {
    // Tree: root(1,10) > branchA(2,5) > leaf(3,4); root > branchB(6,9)
    const root: NestedSetNode = { id: "root", lft: 1, rgt: 10 };
    const branchA: NestedSetNode = { id: "branchA", lft: 2, rgt: 5 };
    const leaf: NestedSetNode = { id: "leaf", lft: 3, rgt: 4 };
    const branchB: NestedSetNode = { id: "branchB", lft: 6, rgt: 9 };

    // Insert a new child into branchA (rightmost child): threshold = branchA.rgt = 5.
    const plan = planInsert([root, branchA, leaf, branchB], branchA);

    expect(plan.newNode).toEqual({ lft: 5, rgt: 6 });
    expect(plan.shifted).toEqual([
      { id: "root", lft: 1, rgt: 12 },
      { id: "branchA", lft: 2, rgt: 7 },
      { id: "leaf", lft: 3, rgt: 4 },
      { id: "branchB", lft: 8, rgt: 11 },
    ]);
  });
});

describe("isWithinSubtree", () => {
  it("returns true for the ancestor itself", () => {
    const node: NestedSetNode = { id: "a", lft: 1, rgt: 10 };
    expect(isWithinSubtree(node, node)).toBe(true);
  });

  it("returns true for a nested descendant", () => {
    const ancestor: NestedSetNode = { id: "root", lft: 1, rgt: 10 };
    const descendant: NestedSetNode = { id: "child", lft: 2, rgt: 5 };
    expect(isWithinSubtree(ancestor, descendant)).toBe(true);
  });

  it("returns false for a sibling subtree", () => {
    const ancestor: NestedSetNode = { id: "branchA", lft: 2, rgt: 5 };
    const sibling: NestedSetNode = { id: "branchB", lft: 6, rgt: 9 };
    expect(isWithinSubtree(ancestor, sibling)).toBe(false);
  });
});

describe("nested-set planDelete", () => {
  //   root (1,10)
  //   ├── branchA (2,5)
  //   │   └── leaf (3,4)
  //   └── branchB (6,9)
  //       └── leafB (7,8)
  const root: NestedSetNode = { id: "root", lft: 1, rgt: 10 };
  const branchA: NestedSetNode = { id: "branchA", lft: 2, rgt: 5 };
  const leaf: NestedSetNode = { id: "leaf", lft: 3, rgt: 4 };
  const branchB: NestedSetNode = { id: "branchB", lft: 6, rgt: 9 };
  const leafB: NestedSetNode = { id: "leafB", lft: 7, rgt: 8 };
  const forest = [root, branchA, leaf, branchB, leafB];

  it("removes the subtree deepest first and closes the gap it leaves", () => {
    const plan = planDelete(forest, branchA);

    expect(plan.removed.map((node) => node.id)).toEqual(["leaf", "branchA"]);
    expect(plan.shifted).toEqual([
      { id: "root", lft: 1, rgt: 6 },
      { id: "branchB", lft: 2, rgt: 5 },
      { id: "leafB", lft: 3, rgt: 4 },
    ]);
  });

  it("leaves nothing behind when the only root goes", () => {
    const only: NestedSetNode = { id: "only", lft: 1, rgt: 2 };
    expect(planDelete([only], only)).toEqual({ removed: [only], shifted: [] });
  });
});

describe("subtreeScopes", () => {
  // A small forest: root (1..6) with child (2..3) and sibling (4..5); a second root (7..8).
  const root: NestedSetNode = { id: "root", lft: 1, rgt: 6 };
  const child: NestedSetNode = { id: "child", lft: 2, rgt: 3 };
  const sibling: NestedSetNode = { id: "sibling", lft: 4, rgt: 5 };
  const other: NestedSetNode = { id: "other", lft: 7, rgt: 8 };
  const self = { project: root, label: "self" };
  const visible = [
    { project: root, label: "root" },
    { project: child, label: "child" },
    { project: sibling, label: "sibling" },
    { project: other, label: "other" },
  ];

  it("returns only the project itself when the setting is off", () => {
    expect(subtreeScopes(false, visible, root, self)).toEqual([self]);
  });

  it("returns the visible contexts within the project's subtree when the setting is on", () => {
    expect(subtreeScopes(true, visible, root, self).map((entry) => entry.label)).toEqual(["root", "child", "sibling"]);
  });

  it("leaves out a project outside the subtree even when it is visible", () => {
    expect(subtreeScopes(true, visible, root, self).some((entry) => entry.label === "other")).toBe(false);
  });

  it("falls back to the project itself when nothing in the subtree is visible", () => {
    expect(subtreeScopes(true, [{ project: other, label: "other" }], root, self)).toEqual([self]);
  });

  it("keeps a subproject the viewer can see even when the project itself is not in the visible list", () => {
    expect(subtreeScopes(true, [{ project: child, label: "child" }], root, self).map((entry) => entry.label)).toEqual(["child"]);
  });
});
