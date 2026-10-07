import { describe, expect, it } from "bun:test";
import { collectSelfAndDescendantIds, wouldCreateParentCycle } from "./parent";

const tree = new Map<string, string | null>([
  ["root", null],
  ["child", "root"],
  ["grandchild", "child"],
  ["unrelated", null],
]);

describe("wouldCreateParentCycle", () => {
  it("rejects an issue becoming its own parent", () => {
    expect(wouldCreateParentCycle("child", "child", tree)).toBe(true);
  });

  it("rejects re-parenting under a direct descendant", () => {
    expect(wouldCreateParentCycle("root", "child", tree)).toBe(true);
  });

  it("rejects re-parenting under a deeper descendant", () => {
    expect(wouldCreateParentCycle("root", "grandchild", tree)).toBe(true);
  });

  it("allows re-parenting under an unrelated issue", () => {
    expect(wouldCreateParentCycle("grandchild", "unrelated", tree)).toBe(false);
  });

  it("allows re-parenting under an ancestor that is already the parent", () => {
    expect(wouldCreateParentCycle("grandchild", "child", tree)).toBe(false);
  });

  it("terminates on a pre-existing loop in the stored data", () => {
    const looped = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(wouldCreateParentCycle("other", "a", looped)).toBe(true);
  });
});

describe("collectSelfAndDescendantIds", () => {
  const forest = new Map<string, string | null>([
    ["root", null],
    ["child-a", "root"],
    ["child-b", "root"],
    ["grandchild", "child-a"],
    ["unrelated", null],
  ]);

  it("returns the issue and its whole subtree, parents first", () => {
    const ids = collectSelfAndDescendantIds("root", forest);
    expect(ids[0]).toBe("root");
    expect(new Set(ids)).toEqual(new Set(["root", "child-a", "child-b", "grandchild"]));
    expect(ids.indexOf("child-a")).toBeLessThan(ids.indexOf("grandchild"));
  });

  it("returns just the issue when it has no children", () => {
    expect(collectSelfAndDescendantIds("unrelated", forest)).toEqual(["unrelated"]);
  });

  it("terminates on a cycle left behind by older data", () => {
    const looped = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(new Set(collectSelfAndDescendantIds("a", looped))).toEqual(new Set(["a", "b"]));
  });
});
