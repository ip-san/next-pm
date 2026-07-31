import { describe, expect, it, mock } from "bun:test";
import { updateIssue, WorkflowTransitionDeniedError } from "./update-issue";
import type { Issue } from "@/domain/issue/entity";
import { StaleIssueError } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { JournalRepository } from "@/domain/journal/repository";
import type { WorkflowRepository } from "@/domain/workflow/repository";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    projectId: "proj-1",
    trackerId: "tracker-1",
    statusId: "new",
    priorityId: "normal",
    subject: "Subject",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepositories(overrides: {
  issue?: Issue | null;
  transitions?: Parameters<WorkflowRepository["listForTracker"]>[0] extends never ? never : unknown[];
} = {}) {
  const issue = overrides.issue ?? makeIssue();
  const issueRepository: IssueRepository = {
    findById: mock(async () => issue),
    listByProject: mock(async () => []),
    findByAssignee: mock(async () => []),
    findByAuthor: mock(async () => []),
    findByIds: mock(async () => []),
    search: mock(async () => []),
    create: mock(async () => issue),
    update: mock(async (_id, _lockVersion, changes) => ({ ...issue, ...changes, lockVersion: issue.lockVersion + 1 })),
  };
  const journalRepository: JournalRepository = {
    listForIssue: mock(async () => []),
    create: mock(async (j) => ({ ...j, id: "journal-1", createdAt: new Date() })),
  };
  const workflowRepository: WorkflowRepository = {
    listForTracker: mock(async () => (overrides.transitions as never) ?? []),
    listForTrackerAndRole: mock(async () => (overrides.transitions as never) ?? []),
    create: mock(async (t) => ({ ...t, id: "transition-1" })),
    replaceForTrackerAndRole: mock(async () => undefined),
  };
  return { issueRepository, journalRepository, workflowRepository };
}

describe("updateIssue", () => {
  it("applies a non-status change and records a journal entry", async () => {
    const repos = makeRepositories();
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "New subject" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: true,
      isAssignee: false,
    });
    expect(result.subject).toBe("New subject");
    expect(repos.journalRepository.create).toHaveBeenCalled();
  });

  it("skips the journal when nothing changed and there are no notes", async () => {
    const repos = makeRepositories();
    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "Subject" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: true,
      isAssignee: false,
    });
    expect(repos.journalRepository.create).not.toHaveBeenCalled();
  });

  it("allows a status change permitted by the workflow", async () => {
    const repos = makeRepositories({
      transitions: [
        {
          id: "t1",
          trackerId: "tracker-1",
          roleId: "role-1",
          oldStatusId: "new",
          newStatusId: "in-progress",
          author: false,
          assignee: false,
        },
      ],
    });
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { statusId: "in-progress" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(result.statusId).toBe("in-progress");
  });

  it("rejects a status change not permitted by the workflow", async () => {
    const repos = makeRepositories({ transitions: [] });
    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { statusId: "closed" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
      }),
    ).rejects.toThrow(WorkflowTransitionDeniedError);
  });

  it("propagates a StaleIssueError from the repository on a lock_version mismatch", async () => {
    const repos = makeRepositories();
    repos.issueRepository.update = mock(async () => {
      throw new StaleIssueError("issue-1");
    });
    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { subject: "x" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: true,
        isAssignee: false,
      }),
    ).rejects.toThrow(StaleIssueError);
  });
});
