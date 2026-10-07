import { describe, expect, it, mock } from "bun:test";
import { moveIssue, ProjectHasNoTrackerError, type MoveIssueRepositories } from "./move-issue";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { Project } from "@/domain/project/entity";
import type { Version } from "@/domain/version/entity";

function makeRepositories(options: {
  issues: Issue[];
  targetTrackerIds?: string[];
  categories?: IssueCategory[];
  sharedVersions?: string[];
  relations?: IssueRelation[];
  settings?: Record<string, string>;
}) {
  const issuesById = new Map(options.issues.map((issue) => [issue.id, { ...issue }]));
  const relations = options.relations ?? [];
  const deletedRelationIds: string[] = [];
  const reassigned: { issueIds: string[]; projectId: string }[] = [];

  const issueRepository = makeIssueRepositoryMock({
    findById: mock(async (id: string) => issuesById.get(id) ?? null),
    listByProject: mock(async (projectId: string) => [...issuesById.values()].filter((i) => i.projectId === projectId)),
    update: mock(async (id: string, _lockVersion: number, changes) => {
      const current = issuesById.get(id)!;
      const next = { ...current, ...changes, lockVersion: current.lockVersion + 1 } as Issue;
      issuesById.set(id, next);
      return next;
    }),
  });

  const repositories: MoveIssueRepositories = {
    issueRepository,
    projectRepository: {
      findById: mock(async (id: string) => ({ id, trackerIds: options.targetTrackerIds ?? ["tracker-1"] }) as unknown as Project),
    } as unknown as MoveIssueRepositories["projectRepository"],
    issueCategoryRepository: {
      listByProject: mock(async (projectId: string) => (options.categories ?? []).filter((c) => c.projectId === projectId)),
    } as unknown as MoveIssueRepositories["issueCategoryRepository"],
    versionRepository: {
      listSharedWith: mock(async () => (options.sharedVersions ?? []).map((id) => ({ id }) as Version)),
    } as unknown as MoveIssueRepositories["versionRepository"],
    issueRelationRepository: {
      listForIssue: mock(async (issueId: string) => relations.filter((r) => r.issueFromId === issueId || r.issueToId === issueId)),
      delete: mock(async (id: string) => {
        deletedRelationIds.push(id);
      }),
    } as unknown as MoveIssueRepositories["issueRelationRepository"],
    timeEntryRepository: {
      reassignProjectForIssues: mock(async (issueIds: string[], projectId: string) => {
        reassigned.push({ issueIds, projectId });
      }),
    } as unknown as MoveIssueRepositories["timeEntryRepository"],
    journalRepository: {
      create: mock(async (journal) => ({ ...journal, id: "journal-1", createdAt: new Date() })),
    } as unknown as MoveIssueRepositories["journalRepository"],
    settingsRepository: {
      getAll: mock(async () => options.settings ?? {}),
    } as unknown as MoveIssueRepositories["settingsRepository"],
  };

  return { repositories, issuesById, deletedRelationIds, reassigned };
}

const base = makeIssue({ id: "issue-1", projectId: "proj-src", trackerId: "tracker-1" });

describe("moveIssue", () => {
  it("re-homes the issue and journals the project change", async () => {
    const { repositories, issuesById } = makeRepositories({ issues: [base] });

    const moved = await moveIssue(repositories, { issueId: "issue-1", targetProjectId: "proj-dst", actingUserId: "user-1" });

    expect(moved.projectId).toBe("proj-dst");
    expect(issuesById.get("issue-1")!.projectId).toBe("proj-dst");
    const journal = (repositories.journalRepository.create as ReturnType<typeof mock>).mock.calls[0][0];
    expect(journal.details).toContainEqual({ property: "attr", fieldName: "projectId", oldValue: "proj-src", newValue: "proj-dst" });
  });

  it("refuses a target project with no tracker enabled", async () => {
    const { repositories } = makeRepositories({ issues: [base], targetTrackerIds: [] });

    await expect(
      moveIssue(repositories, { issueId: "issue-1", targetProjectId: "proj-dst", actingUserId: "user-1" }),
    ).rejects.toThrow(ProjectHasNoTrackerError);
  });

  it("falls back to the target project's first tracker, and honours an explicit one", async () => {
    const { repositories, issuesById } = makeRepositories({ issues: [base], targetTrackerIds: ["tracker-7", "tracker-8"] });
    await moveIssue(repositories, { issueId: "issue-1", targetProjectId: "proj-dst", actingUserId: "user-1" });
    expect(issuesById.get("issue-1")!.trackerId).toBe("tracker-7");

    const second = makeRepositories({ issues: [base], targetTrackerIds: ["tracker-7", "tracker-8"] });
    await moveIssue(second.repositories, {
      issueId: "issue-1",
      targetProjectId: "proj-dst",
      targetTrackerId: "tracker-8",
      actingUserId: "user-1",
    });
    expect(second.issuesById.get("issue-1")!.trackerId).toBe("tracker-8");
  });

  it("re-matches the category by name and drops an unshared version", async () => {
    const issue = makeIssue({ id: "issue-1", projectId: "proj-src", trackerId: "tracker-1", categoryId: "cat-src", fixedVersionId: "v-1" });
    const { repositories, issuesById } = makeRepositories({
      issues: [issue],
      categories: [
        { id: "cat-src", projectId: "proj-src", name: "Bugs", assignedToId: null },
        { id: "cat-dst", projectId: "proj-dst", name: "Bugs", assignedToId: null },
      ],
    });

    await moveIssue(repositories, { issueId: "issue-1", targetProjectId: "proj-dst", actingUserId: "user-1" });

    expect(issuesById.get("issue-1")!.categoryId).toBe("cat-dst");
    expect(issuesById.get("issue-1")!.fixedVersionId).toBeNull();
  });

  it("drags same-project subtasks along, keeping their tracker and parent link", async () => {
    const parent = makeIssue({ id: "parent", projectId: "proj-src", trackerId: "tracker-1" });
    const child = makeIssue({ id: "child", projectId: "proj-src", trackerId: "tracker-3", parentId: "parent" });
    const grandchild = makeIssue({ id: "grandchild", projectId: "proj-src", trackerId: "tracker-3", parentId: "child" });
    const elsewhere = makeIssue({ id: "elsewhere", projectId: "proj-other", trackerId: "tracker-1", parentId: "parent" });
    const { repositories, issuesById, reassigned } = makeRepositories({
      issues: [parent, child, grandchild, elsewhere],
      targetTrackerIds: ["tracker-1"],
    });

    await moveIssue(repositories, { issueId: "parent", targetProjectId: "proj-dst", actingUserId: "user-1" });

    expect(issuesById.get("child")!.projectId).toBe("proj-dst");
    expect(issuesById.get("grandchild")!.projectId).toBe("proj-dst");
    // keep_tracker: a child isn't rewritten to the target project's first tracker.
    expect(issuesById.get("child")!.trackerId).toBe("tracker-3");
    expect(issuesById.get("child")!.parentId).toBe("parent");
    // A descendant that already lived in another project stays where it is.
    expect(issuesById.get("elsewhere")!.projectId).toBe("proj-other");
    expect(reassigned[0]).toEqual({ issueIds: ["parent", "child", "grandchild"], projectId: "proj-dst" });
  });

  it("clears a parent that stays behind", async () => {
    const parent = makeIssue({ id: "parent", projectId: "proj-src", trackerId: "tracker-1" });
    const child = makeIssue({ id: "child", projectId: "proj-src", trackerId: "tracker-1", parentId: "parent" });
    const { repositories, issuesById } = makeRepositories({ issues: [parent, child] });

    await moveIssue(repositories, { issueId: "child", targetProjectId: "proj-dst", actingUserId: "user-1" });

    expect(issuesById.get("child")!.parentId).toBeNull();
    expect(issuesById.get("parent")!.projectId).toBe("proj-src");
  });

  it("drops relations that would now span projects, keeping ones that moved together", async () => {
    const parent = makeIssue({ id: "parent", projectId: "proj-src", trackerId: "tracker-1" });
    const child = makeIssue({ id: "child", projectId: "proj-src", trackerId: "tracker-1", parentId: "parent" });
    const stranger = makeIssue({ id: "stranger", projectId: "proj-src", trackerId: "tracker-1" });
    const { repositories, deletedRelationIds } = makeRepositories({
      issues: [parent, child, stranger],
      relations: [
        { id: "rel-internal", issueFromId: "parent", issueToId: "child", relationType: "relates", delay: null },
        { id: "rel-external", issueFromId: "parent", issueToId: "stranger", relationType: "relates", delay: null },
      ],
    });

    await moveIssue(repositories, { issueId: "parent", targetProjectId: "proj-dst", actingUserId: "user-1" });

    expect(deletedRelationIds).toEqual(["rel-external"]);
  });

  it("keeps cross-project relations when the setting allows them", async () => {
    const issue = makeIssue({ id: "issue-1", projectId: "proj-src", trackerId: "tracker-1" });
    const stranger = makeIssue({ id: "stranger", projectId: "proj-src", trackerId: "tracker-1" });
    const { repositories, deletedRelationIds } = makeRepositories({
      issues: [issue, stranger],
      relations: [{ id: "rel-external", issueFromId: "issue-1", issueToId: "stranger", relationType: "relates", delay: null }],
      settings: { cross_project_issue_relations: "1" },
    });

    await moveIssue(repositories, { issueId: "issue-1", targetProjectId: "proj-dst", actingUserId: "user-1" });

    expect(deletedRelationIds).toEqual([]);
  });
});
