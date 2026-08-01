import { describe, expect, it, mock } from "bun:test";
import { updateIssue, WorkflowRequiredFieldError, WorkflowTransitionDeniedError } from "./update-issue";
import type { Issue } from "@/domain/issue/entity";
import { StaleIssueError } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { JournalRepository } from "@/domain/journal/repository";
import type { WorkflowFieldPermission } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

function makeRepositories(
  overrides: {
    issue?: Issue | null;
    transitions?: Parameters<WorkflowRepository["listForTracker"]>[0] extends never ? never : unknown[];
    fieldPermissions?: WorkflowFieldPermission[];
  } = {},
) {
  const issue = overrides.issue ?? makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" });
  const issueRepository = makeIssueRepositoryMock({
    findById: mock(async () => issue),
    create: mock(async () => issue),
    update: mock(async (_id, _lockVersion, changes) => ({ ...issue, ...changes, lockVersion: issue.lockVersion + 1 })),
  });
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
  const workflowFieldPermissionRepository: WorkflowFieldPermissionRepository = {
    listForTracker: mock(async () => overrides.fieldPermissions ?? []),
    listForTrackerAndRole: mock(async () => overrides.fieldPermissions ?? []),
    replaceForTrackerAndRole: mock(async () => undefined),
  };
  return { issueRepository, journalRepository, workflowRepository, workflowFieldPermissionRepository };
}

function fieldPermission(overrides: Partial<WorkflowFieldPermission>): WorkflowFieldPermission {
  return {
    id: "fp-1",
    trackerId: "tracker-1",
    roleId: "role-1",
    statusId: "new",
    fieldName: "dueDate",
    rule: "required",
    ...overrides,
  };
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

  it("silently strips a change to a field marked read-only for this tracker/role/status", async () => {
    const repos = makeRepositories({
      fieldPermissions: [fieldPermission({ fieldName: "categoryId", rule: "readonly" })],
    });
    const updateSpy = mock(repos.issueRepository.update);
    repos.issueRepository.update = updateSpy;
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "New subject", categoryId: "category-2" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: true,
      isAssignee: false,
    });
    expect(result.subject).toBe("New subject");
    expect(result.categoryId).not.toBe("category-2");
    const [, , appliedChanges] = updateSpy.mock.calls[0];
    expect(appliedChanges).not.toHaveProperty("categoryId");
  });

  it("rejects an update that would leave a required field blank", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", dueDate: null });
    const repos = makeRepositories({
      issue,
      fieldPermissions: [fieldPermission({ fieldName: "dueDate", rule: "required" })],
    });
    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { subject: "New subject" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: true,
        isAssignee: false,
      }),
    ).rejects.toThrow(WorkflowRequiredFieldError);
    expect(repos.issueRepository.update).not.toHaveBeenCalled();
  });

  it("allows the update when the required field is filled by the change itself", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", dueDate: null });
    const repos = makeRepositories({
      issue,
      fieldPermissions: [fieldPermission({ fieldName: "dueDate", rule: "required" })],
    });
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-01" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: true,
      isAssignee: false,
    });
    expect(result.dueDate).toBe("2026-01-01");
  });

  it("does not treat an explicitly-undefined key (every REST PATCH field, when omitted) as clearing an already-filled required field", async () => {
    // Mirrors the REST PATCH route, which always sends every IssueUpdate key, `undefined` for
    // anything the caller didn't include — that must not shadow `before.dueDate` in the merge.
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", dueDate: "2026-01-01" });
    const repos = makeRepositories({
      issue,
      fieldPermissions: [fieldPermission({ fieldName: "dueDate", rule: "required" })],
    });
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "New subject", dueDate: undefined },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: true,
      isAssignee: false,
    });
    expect(result.subject).toBe("New subject");
  });

  it("evaluates field rules against the resulting status when the status is also changing", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", dueDate: null });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "in-progress", author: false, assignee: false },
      ],
      // The rule is scoped to "in-progress" (the target status), not "new" (the current one).
      fieldPermissions: [fieldPermission({ statusId: "in-progress", fieldName: "dueDate", rule: "required" })],
    });
    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { statusId: "in-progress" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
      }),
    ).rejects.toThrow(WorkflowRequiredFieldError);
  });
});
