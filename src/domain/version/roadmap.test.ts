import { describe, expect, it } from "bun:test";
import type { Version } from "./entity";
import { selectRoadmapVersions, type RoadmapIssue } from "./roadmap";

const version = (id: string, projectId: string, effectiveDate: string | null = "2026-03-01"): Version => ({
  id,
  projectId,
  name: id,
  description: "",
  effectiveDate,
  status: "open",
  sharing: "none",
  wikiPageTitle: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const issue = (overrides: Partial<RoadmapIssue> & Pick<RoadmapIssue, "id" | "number" | "projectId" | "fixedVersionId">): RoadmapIssue => ({
  trackerId: "bug",
  projectLft: 1,
  trackerPosition: 1,
  ...overrides,
});

const roadmapTrackerIds = new Set(["bug", "feature"]);

describe("selectRoadmapVersions", () => {
  it("lists a shared version's visible issues from the scope projects", () => {
    const shared = version("v-shared", "other");
    const result = selectRoadmapVersions({
      sharedVersions: [shared],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent", "child"]),
      visibleIssues: [issue({ id: "a", number: 1, projectId: "child", fixedVersionId: "v-shared", projectLft: 3 })],
      roadmapTrackerIds,
    });
    expect(result.map((entry) => entry.version.id)).toEqual(["v-shared"]);
    expect(result[0].issues.map((item) => item.id)).toEqual(["a"]);
  });

  it("drops a shared version from outside the scope when it has no issues to list", () => {
    const result = selectRoadmapVersions({
      sharedVersions: [version("v-outside", "other")],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent"]),
      visibleIssues: [],
      roadmapTrackerIds,
    });
    expect(result).toEqual([]);
  });

  it("keeps a version of a scope project even with no issues", () => {
    const result = selectRoadmapVersions({
      sharedVersions: [version("v-own", "parent")],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent"]),
      visibleIssues: [],
      roadmapTrackerIds,
    });
    expect(result.map((entry) => entry.version.id)).toEqual(["v-own"]);
    expect(result[0].issues).toEqual([]);
  });

  it("counts a version from outside the scope when it has issues to list", () => {
    const result = selectRoadmapVersions({
      sharedVersions: [version("v-outside", "other")],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent"]),
      visibleIssues: [issue({ id: "a", number: 1, projectId: "parent", fixedVersionId: "v-outside" })],
      roadmapTrackerIds,
    });
    expect(result.map((entry) => entry.version.id)).toEqual(["v-outside"]);
  });

  it("de-duplicates a version reached both as shared and as rolled up", () => {
    const own = version("v-own", "parent");
    const result = selectRoadmapVersions({
      sharedVersions: [own],
      rolledUpVersions: [own],
      scopeProjectIds: new Set(["parent"]),
      visibleIssues: [],
      roadmapTrackerIds,
    });
    expect(result.map((entry) => entry.version.id)).toEqual(["v-own"]);
  });

  it("lists only the roadmap trackers, but computes progress from every visible issue", () => {
    const result = selectRoadmapVersions({
      sharedVersions: [version("v", "parent")],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent"]),
      visibleIssues: [
        issue({ id: "a", number: 1, projectId: "parent", fixedVersionId: "v", trackerId: "bug" }),
        issue({ id: "b", number: 2, projectId: "parent", fixedVersionId: "v", trackerId: "support" }),
      ],
      roadmapTrackerIds,
    });
    expect(result[0].issues.map((item) => item.id)).toEqual(["a"]);
    expect(result[0].progressIssues.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("orders issues by project, then tracker position, then number", () => {
    const result = selectRoadmapVersions({
      sharedVersions: [version("v", "parent")],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent", "child"]),
      visibleIssues: [
        issue({ id: "child-1", number: 4, projectId: "child", fixedVersionId: "v", projectLft: 3, trackerPosition: 1 }),
        issue({ id: "parent-feature", number: 3, projectId: "parent", fixedVersionId: "v", projectLft: 1, trackerPosition: 2, trackerId: "feature" }),
        issue({ id: "parent-bug-2", number: 2, projectId: "parent", fixedVersionId: "v", projectLft: 1, trackerPosition: 1 }),
        issue({ id: "parent-bug-1", number: 1, projectId: "parent", fixedVersionId: "v", projectLft: 1, trackerPosition: 1 }),
      ],
      roadmapTrackerIds,
    });
    expect(result[0].issues.map((item) => item.id)).toEqual(["parent-bug-1", "parent-bug-2", "parent-feature", "child-1"]);
  });

  it("sorts versions by date, undated last", () => {
    const result = selectRoadmapVersions({
      sharedVersions: [version("undated", "parent", null), version("later", "parent", "2026-06-01"), version("earlier", "parent", "2026-01-01")],
      rolledUpVersions: [],
      scopeProjectIds: new Set(["parent"]),
      visibleIssues: [],
      roadmapTrackerIds,
    });
    expect(result.map((entry) => entry.version.id)).toEqual(["earlier", "later", "undated"]);
  });
});
