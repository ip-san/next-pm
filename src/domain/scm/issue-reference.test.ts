import { describe, expect, it } from "bun:test";
import { canReferenceIssueProject } from "./issue-reference";

// A nested set over: root (1..8) → child (2..5) → grandchild (3..4), and sibling (6..7).
const root = { id: "root", lft: 1, rgt: 8 };
const child = { id: "child", lft: 2, rgt: 5 };
const grandchild = { id: "grandchild", lft: 3, rgt: 4 };
const sibling = { id: "sibling", lft: 6, rgt: 7 };
const unrelated = { id: "unrelated", lft: 9, rgt: 10 };

describe("canReferenceIssueProject with commit_cross_project_ref off", () => {
  it("allows the repository's own project", () => {
    expect(canReferenceIssueProject(child, child, false)).toBe(true);
  });

  it("allows an ancestor", () => {
    expect(canReferenceIssueProject(child, root, false)).toBe(true);
  });

  it("allows a descendant", () => {
    expect(canReferenceIssueProject(child, grandchild, false)).toBe(true);
  });

  // The easy one to get wrong: Redmine's condition covers ancestors and descendants only.
  it("rejects a sibling", () => {
    expect(canReferenceIssueProject(child, sibling, false)).toBe(false);
  });

  it("rejects a project in another tree", () => {
    expect(canReferenceIssueProject(child, unrelated, false)).toBe(false);
  });
});

describe("canReferenceIssueProject with commit_cross_project_ref on", () => {
  it("allows any project", () => {
    for (const project of [root, child, grandchild, sibling, unrelated]) {
      expect(canReferenceIssueProject(child, project, true)).toBe(true);
    }
  });
});
