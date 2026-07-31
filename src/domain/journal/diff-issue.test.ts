import { describe, expect, it } from "bun:test";
import { diffIssueChanges } from "./diff-issue";
import type { Issue } from "@/domain/issue/entity";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    projectId: "proj-1",
    trackerId: "tracker-1",
    statusId: "new",
    priorityId: "normal",
    subject: "Original subject",
    description: "",
    authorId: "user-1",
    assignedToId: null,
    parentId: null,
    fixedVersionId: null,
    categoryId: null,
    isPrivate: false,
    doneRatio: 0,
    estimatedHours: null,
    startDate: null,
    dueDate: null,
    lockVersion: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("diffIssueChanges", () => {
  it("returns no details when nothing actually changed", () => {
    const issue = makeIssue();
    expect(diffIssueChanges(issue, { statusId: "new" })).toEqual([]);
  });

  it("records a changed field with old and new values", () => {
    const issue = makeIssue({ statusId: "new" });
    expect(diffIssueChanges(issue, { statusId: "in-progress" })).toEqual([
      { property: "attr", fieldName: "statusId", oldValue: "new", newValue: "in-progress" },
    ]);
  });

  it("records a field cleared to null", () => {
    const issue = makeIssue({ assignedToId: "user-2" });
    expect(diffIssueChanges(issue, { assignedToId: null })).toEqual([
      { property: "attr", fieldName: "assignedToId", oldValue: "user-2", newValue: null },
    ]);
  });

  it("ignores fields explicitly set to undefined (e.g. an unset REST PATCH field), not just absent keys", () => {
    // Reproduces a real bug: a partial-update object with every optional key present but
    // undefined (as zod's .optional() produces from a partial PATCH body) must not be
    // read as "every field was cleared to null".
    const issue = makeIssue({ priorityId: "normal", subject: "Original", isPrivate: false, doneRatio: 0 });
    const changes = {
      statusId: "in-progress",
      priorityId: undefined,
      subject: undefined,
      isPrivate: undefined,
      doneRatio: undefined,
    };
    expect(diffIssueChanges(issue, changes)).toEqual([
      { property: "attr", fieldName: "statusId", oldValue: "new", newValue: "in-progress" },
    ]);
  });

  it("ignores fields not present in the update", () => {
    const issue = makeIssue({ subject: "Original" });
    expect(diffIssueChanges(issue, { doneRatio: 50 })).toEqual([
      { property: "attr", fieldName: "doneRatio", oldValue: "0", newValue: "50" },
    ]);
  });

  it("records multiple changed fields", () => {
    const issue = makeIssue({ statusId: "new", doneRatio: 0 });
    const details = diffIssueChanges(issue, { statusId: "closed", doneRatio: 100 });
    expect(new Set(details.map((d) => d.fieldName))).toEqual(new Set(["statusId", "doneRatio"]));
  });
});
