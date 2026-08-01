import { describe, expect, it } from "bun:test";
import { aggregateIssueCounts, totalCounts } from "./issue-report";
import type { Issue } from "@/domain/issue/entity";

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "issue-1",
    projectId: "project-1",
    trackerId: "tracker-1",
    statusId: "open-status",
    priorityId: "priority-1",
    subject: "Test issue",
    description: "",
    authorId: "user-1",
    assignedToId: null,
    assignedToType: null,
    parentId: null,
    fixedVersionId: null,
    categoryId: null,
    isPrivate: false,
    doneRatio: 0,
    estimatedHours: null,
    startDate: null,
    dueDate: null,
    lockVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("aggregateIssueCounts", () => {
  const closedStatusIds = new Set(["closed-status"]);

  it("buckets issues by the grouping key, splitting open vs closed", () => {
    const issues = [
      issue({ id: "a", trackerId: "bug", statusId: "open-status" }),
      issue({ id: "b", trackerId: "bug", statusId: "closed-status" }),
      issue({ id: "c", trackerId: "feature", statusId: "open-status" }),
    ];
    const counts = aggregateIssueCounts(issues, closedStatusIds, (i) => i.trackerId);
    expect(counts.get("bug")).toEqual({ open: 1, closed: 1, total: 2 });
    expect(counts.get("feature")).toEqual({ open: 1, closed: 0, total: 1 });
  });

  it("buckets a null grouping value under the null key", () => {
    const issues = [issue({ id: "a", assignedToId: null }), issue({ id: "b", assignedToId: "user-2" })];
    const counts = aggregateIssueCounts(issues, closedStatusIds, (i) => i.assignedToId);
    expect(counts.get(null)).toEqual({ open: 1, closed: 0, total: 1 });
    expect(counts.get("user-2")).toEqual({ open: 1, closed: 0, total: 1 });
  });

  it("returns an empty map for no issues", () => {
    expect(aggregateIssueCounts([], closedStatusIds, (i) => i.trackerId).size).toBe(0);
  });
});

describe("totalCounts", () => {
  it("sums every row", () => {
    const issues = [
      issue({ id: "a", trackerId: "bug", statusId: "open-status" }),
      issue({ id: "b", trackerId: "bug", statusId: "closed-status" }),
      issue({ id: "c", trackerId: "feature", statusId: "open-status" }),
    ];
    const counts = aggregateIssueCounts(issues, new Set(["closed-status"]), (i) => i.trackerId);
    expect(totalCounts(counts)).toEqual({ open: 2, closed: 1, total: 3 });
  });

  it("returns all zeroes for an empty map", () => {
    expect(totalCounts(new Map())).toEqual({ open: 0, closed: 0, total: 0 });
  });
});
