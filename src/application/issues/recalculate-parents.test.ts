import { describe, expect, it, mock } from "bun:test";
import { recalculateParents, type RecalculateParentsRepositories } from "./recalculate-parents";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueStatus } from "@/domain/issue-status/entity";

const DERIVED = {
  parent_issue_dates: "derived",
  parent_issue_priority: "derived",
  parent_issue_done_ratio: "derived",
};

function makeRepositories(options: {
  issues: Issue[];
  settings?: Record<string, string>;
  statuses?: IssueStatus[];
  priorities?: Enumeration[];
}) {
  const issuesById = new Map(options.issues.map((issue) => [issue.id, { ...issue }]));
  const updates: { id: string; changes: Record<string, unknown> }[] = [];

  const repositories: RecalculateParentsRepositories = {
    issueRepository: makeIssueRepositoryMock({
      findById: mock(async (id: string) => issuesById.get(id) ?? null),
      listByProject: mock(async () => [...issuesById.values()]),
      update: mock(async (id: string, _lock: number, changes) => {
        updates.push({ id, changes: changes as Record<string, unknown> });
        const next = { ...issuesById.get(id)!, ...changes } as Issue;
        issuesById.set(id, next);
        return next;
      }),
    }),
    issueStatusRepository: {
      listAll: mock(async () => options.statuses ?? [{ id: "open", name: "Open", isClosed: false, defaultDoneRatio: null, description: "", position: 1 }]),
      findById: mock(async () => null),
      create: mock(async () => {
        throw new Error("not used");
      }),
    },
    enumerationRepository: {
      listByType: mock(
        async () =>
          options.priorities ?? [
            { id: "normal", type: "IssuePriority", name: "Normal", position: 2, isDefault: true, active: true, projectId: null, parentId: null },
            { id: "urgent", type: "IssuePriority", name: "Urgent", position: 5, isDefault: false, active: true, projectId: null, parentId: null },
          ] satisfies Enumeration[],
      ),
      create: mock(async () => {
        throw new Error("not used");
      }),
      unsetSystemDefaultsForType: mock(async () => undefined),
    },
    settingsRepository: {
      getAll: mock(async () => options.settings ?? DERIVED),
      setMany: mock(async () => undefined),
    },
  };

  return { repositories, issuesById, updates };
}

const leafDefaults = { statusId: "open", priorityId: "normal", projectId: "proj-1" };

describe("recalculateParents", () => {
  it("does nothing while every parent_issue_* setting is independent", async () => {
    const parent = makeIssue({ id: "parent", ...leafDefaults });
    const child = makeIssue({ id: "child", ...leafDefaults, parentId: "parent", startDate: "2026-01-01" });
    const { repositories, updates } = makeRepositories({ issues: [parent, child], settings: {} });

    await recalculateParents(repositories, "child");

    expect(updates).toEqual([]);
  });

  it("rolls a child's dates up into its parent", async () => {
    const parent = makeIssue({ id: "parent", ...leafDefaults });
    const child = makeIssue({ id: "child", ...leafDefaults, parentId: "parent", startDate: "2026-02-01", dueDate: "2026-03-01" });
    const { repositories, issuesById } = makeRepositories({ issues: [parent, child] });

    await recalculateParents(repositories, "child");

    expect(issuesById.get("parent")).toMatchObject({ startDate: "2026-02-01", dueDate: "2026-03-01" });
  });

  it("recurses all the way to the root, as Redmine's save cascade does", async () => {
    const root = makeIssue({ id: "root", ...leafDefaults });
    const mid = makeIssue({ id: "mid", ...leafDefaults, parentId: "root" });
    const leaf = makeIssue({ id: "leaf", ...leafDefaults, parentId: "mid", doneRatio: 100 });
    const { repositories, issuesById } = makeRepositories({ issues: [root, mid, leaf] });

    await recalculateParents(repositories, "leaf");

    expect(issuesById.get("mid")!.doneRatio).toBe(100);
    expect(issuesById.get("root")!.doneRatio).toBe(100);
  });

  it("refreshes a parent the issue just left as well as its new one", async () => {
    const oldParent = makeIssue({ id: "old", ...leafDefaults, doneRatio: 100 });
    const newParent = makeIssue({ id: "new", ...leafDefaults });
    const moved = makeIssue({ id: "moved", ...leafDefaults, parentId: "new", doneRatio: 40 });
    const remaining = makeIssue({ id: "remaining", ...leafDefaults, parentId: "old", doneRatio: 0 });
    const { repositories, issuesById } = makeRepositories({ issues: [oldParent, newParent, moved, remaining] });

    await recalculateParents(repositories, "moved", ["old"]);

    expect(issuesById.get("new")!.doneRatio).toBe(40);
    expect(issuesById.get("old")!.doneRatio).toBe(0);
  });

  it("writes nothing when the derived values already match", async () => {
    const parent = makeIssue({ id: "parent", ...leafDefaults, doneRatio: 50, startDate: "2026-01-01", dueDate: "2026-01-01" });
    const child = makeIssue({ id: "child", ...leafDefaults, parentId: "parent", doneRatio: 50, startDate: "2026-01-01", dueDate: "2026-01-01" });
    const { repositories, updates } = makeRepositories({ issues: [parent, child] });

    await recalculateParents(repositories, "child");

    expect(updates).toEqual([]);
  });

  it("takes the highest priority among open children", async () => {
    const parent = makeIssue({ id: "parent", ...leafDefaults });
    const calm = makeIssue({ id: "calm", ...leafDefaults, parentId: "parent" });
    const urgent = makeIssue({ id: "urgent-child", ...leafDefaults, parentId: "parent", priorityId: "urgent" });
    const { repositories, issuesById } = makeRepositories({ issues: [parent, calm, urgent] });

    await recalculateParents(repositories, "urgent-child");

    expect(issuesById.get("parent")!.priorityId).toBe("urgent");
  });

  it("weights the rolled-up done ratio by each child's whole subtree estimate", async () => {
    // child-a totals 30h (10 of its own + 20 from its child) at 100%, child-b 10h at 0%.
    const parent = makeIssue({ id: "parent", ...leafDefaults });
    const childA = makeIssue({ id: "child-a", ...leafDefaults, parentId: "parent", estimatedHours: 10, doneRatio: 100 });
    const grandchild = makeIssue({ id: "grandchild", ...leafDefaults, parentId: "child-a", estimatedHours: 20, doneRatio: 100 });
    const childB = makeIssue({ id: "child-b", ...leafDefaults, parentId: "parent", estimatedHours: 10, doneRatio: 0 });
    const { repositories, issuesById } = makeRepositories({ issues: [parent, childA, grandchild, childB] });

    await recalculateParents(repositories, "grandchild");

    expect(issuesById.get("parent")!.doneRatio).toBe(75);
  });

  it("leaves a childless issue untouched", async () => {
    const lonely = makeIssue({ id: "lonely", ...leafDefaults });
    const { repositories, updates } = makeRepositories({ issues: [lonely] });

    await recalculateParents(repositories, "lonely");

    expect(updates).toEqual([]);
  });
});
