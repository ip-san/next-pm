import { describe, expect, it } from "bun:test";
import { isWithinSubtree, planInsert, type NestedSetNode } from "./nested-set";

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
