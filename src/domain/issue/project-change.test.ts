import { describe, expect, it } from "bun:test";
import { resolveProjectChange } from "./project-change";
import { makeIssue } from "./test-support";

function input(overrides: Partial<Parameters<typeof resolveProjectChange>[0]> = {}) {
  return {
    issue: makeIssue({ trackerId: "tracker-1", categoryId: null, fixedVersionId: null, parentId: null }),
    targetTrackerIds: ["tracker-1", "tracker-9"],
    targetCategoryIdByName: new Map<string, string>(),
    currentCategoryName: null,
    targetSharedVersionIds: new Set<string>(),
    parentMovesToo: false,
    keepTracker: false,
    ...overrides,
  };
}

describe("resolveProjectChange", () => {
  it("keeps a tracker the target project enables", () => {
    expect(resolveProjectChange(input()).trackerId).toBe("tracker-1");
  });

  it("falls back to the target project's first tracker when the current one isn't enabled", () => {
    const result = resolveProjectChange(input({ targetTrackerIds: ["tracker-9", "tracker-8"] }));
    expect(result.trackerId).toBe("tracker-9");
  });

  it("keeps the tracker regardless when moving a subtask along with its parent", () => {
    // Redmine's keep_tracker argument: the parent's move already picked a tracker, and
    // rewriting each child's independently would scramble the subtree.
    const result = resolveProjectChange(input({ targetTrackerIds: ["tracker-9"], keepTracker: true }));
    expect(result.trackerId).toBe("tracker-1");
  });

  it("re-matches the category by name in the target project", () => {
    const result = resolveProjectChange(
      input({
        issue: makeIssue({ trackerId: "tracker-1", categoryId: "category-here" }),
        currentCategoryName: "Bugs",
        targetCategoryIdByName: new Map([["Bugs", "category-there"]]),
      }),
    );
    expect(result.categoryId).toBe("category-there");
  });

  it("drops the category when the target project has no category of that name", () => {
    const result = resolveProjectChange(
      input({ issue: makeIssue({ trackerId: "tracker-1", categoryId: "category-here" }), currentCategoryName: "Bugs" }),
    );
    expect(result.categoryId).toBeNull();
  });

  it("keeps a version that is shared with the target project", () => {
    const result = resolveProjectChange(
      input({
        issue: makeIssue({ trackerId: "tracker-1", fixedVersionId: "version-1" }),
        targetSharedVersionIds: new Set(["version-1"]),
      }),
    );
    expect(result.fixedVersionId).toBe("version-1");
  });

  it("drops a version that is not shared with the target project", () => {
    const result = resolveProjectChange(input({ issue: makeIssue({ trackerId: "tracker-1", fixedVersionId: "version-1" }) }));
    expect(result.fixedVersionId).toBeNull();
  });

  it("clears the parent when it stays behind", () => {
    const result = resolveProjectChange(input({ issue: makeIssue({ trackerId: "tracker-1", parentId: "parent-1" }) }));
    expect(result.parentId).toBeNull();
  });

  it("keeps the parent when it is moving in the same operation", () => {
    const result = resolveProjectChange(
      input({ issue: makeIssue({ trackerId: "tracker-1", parentId: "parent-1" }), parentMovesToo: true }),
    );
    expect(result.parentId).toBe("parent-1");
  });
});
