import { describe, expect, it, mock } from "bun:test";
import { BlockedIssueCloseError, updateIssue, WorkflowRequiredFieldError, WorkflowTransitionDeniedError } from "./update-issue";
import type { Issue } from "@/domain/issue/entity";
import { StaleIssueError } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import type { JournalRepository } from "@/domain/journal/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { UserPreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";
import type { WorkflowFieldPermission } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

function makeRepositories(
  overrides: {
    issue?: Issue | null;
    transitions?: Parameters<WorkflowRepository["listForTracker"]>[0] extends never ? never : unknown[];
    fieldPermissions?: WorkflowFieldPermission[];
    statuses?: IssueStatus[];
    relations?: IssueRelation[];
    otherIssues?: Issue[];
    settings?: Record<string, string>;
    userPreferences?: UserPreferences | null;
  } = {},
) {
  const issue = overrides.issue ?? makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" });
  const issueRepository = makeIssueRepositoryMock({
    findById: mock(async () => issue),
    findByIds: mock(async () => overrides.otherIssues ?? []),
    create: mock(async () => issue),
    update: mock(async (_id, _lockVersion, changes) => ({ ...issue, ...changes, lockVersion: issue.lockVersion + 1 })),
  });
  const journalRepository: JournalRepository = {
    findById: mock(async () => null),
    listForIssue: mock(async () => []),
    listByProject: mock(async () => []),
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
  const statuses = overrides.statuses ?? [];
  const issueStatusRepository: IssueStatusRepository = {
    findById: mock(async (id) => statuses.find((s) => s.id === id) ?? null),
    listAll: mock(async () => statuses),
    create: mock(async (s) => ({ ...s, id: "status-1" })),
  };
  const relations = overrides.relations ?? [];
  const issueRelationRepository: IssueRelationRepository = {
    listForIssue: mock(async () => relations),
    findById: mock(async (id) => relations.find((r) => r.id === id) ?? null),
    create: mock(async (r) => ({ ...r, id: "relation-1" })),
    delete: mock(async () => undefined),
  };
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => overrides.settings ?? {}),
    setMany: mock(async () => undefined),
  };
  const userPreferencesRepository: UserPreferencesRepository = {
    findByUserId: mock(async () => overrides.userPreferences ?? null),
    upsert: mock(async () => undefined),
  };
  const watcherRepository = {
    isWatching: mock(async () => false),
    watch: mock(async () => undefined),
    unwatch: mock(async () => undefined),
    listWatchedIds: mock(async () => [] as string[]),
    listWatcherUserIds: mock(async () => [] as string[]),
  } satisfies WatcherRepository;
  return {
    issueRepository,
    journalRepository,
    workflowRepository,
    workflowFieldPermissionRepository,
    issueStatusRepository,
    issueRelationRepository,
    settingsRepository,
    userPreferencesRepository,
    watcherRepository,
  };
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

  it("leaves done_ratio untouched on a status change when issue_done_ratio is issue_field (the default)", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", doneRatio: 20 });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
      statuses: [{ id: "closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: 100, position: 1 }],
    });
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(result.doneRatio).toBe(20);
  });

  it("derives done_ratio from the target status's defaultDoneRatio when issue_done_ratio is issue_status", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", doneRatio: 20 });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
      statuses: [{ id: "closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: 100, position: 1 }],
      settings: { issue_done_ratio: "issue_status" },
    });
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(result.doneRatio).toBe(100);
  });

  it("does not override an explicit done_ratio change in the same request when a status without a defaultDoneRatio is targeted", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", doneRatio: 20 });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "in-progress", author: false, assignee: false },
      ],
      statuses: [{ id: "in-progress", name: "In Progress", description: "", isClosed: false, defaultDoneRatio: null, position: 1 }],
      settings: { issue_done_ratio: "issue_status" },
    });
    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { statusId: "in-progress", doneRatio: 40 },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(result.doneRatio).toBe(40);
  });

  it("auto-watches for the acting user when a journal is recorded (issue_contributed_to)", async () => {
    const repos = makeRepositories();
    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "New subject" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(repos.watcherRepository.watch).toHaveBeenCalledWith("Issue", "issue-1", "user-1");
  });

  it("does not auto-watch when nothing changed and there are no notes (no journal recorded)", async () => {
    const repos = makeRepositories();
    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: {},
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(repos.watcherRepository.watch).not.toHaveBeenCalled();
  });

  it("auto-watches the newly assigned user (issue_assigned_to_me) when assignedToId changes", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", assignedToId: null, assignedToType: null });
    const repos = makeRepositories({ issue });
    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { assignedToId: "user-2", assignedToType: "user" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(repos.watcherRepository.watch).toHaveBeenCalledWith("Issue", "issue-1", "user-2");
  });

  it("does not auto-watch on reassignment to a group", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", assignedToId: null, assignedToType: null });
    const repos = makeRepositories({ issue });
    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { assignedToId: "group-1", assignedToType: "group" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(repos.watcherRepository.watch).not.toHaveBeenCalledWith("Issue", "issue-1", "group-1");
  });

  it("does not re-trigger issue_assigned_to_me when assignedToId is unchanged", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", assignedToId: "user-2", assignedToType: "user" });
    const repos = makeRepositories({ issue });
    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "New subject", assignedToId: "user-2", assignedToType: "user" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(repos.watcherRepository.watch).not.toHaveBeenCalledWith("Issue", "issue-1", "user-2");
  });

  it("rejects closing an issue blocked by an open issue", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
      statuses: [
        { id: "closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: null, position: 1 },
        { id: "new", name: "New", description: "", isClosed: false, defaultDoneRatio: null, position: 0 },
      ],
      relations: [{ id: "rel-1", issueFromId: "blocker-1", issueToId: "issue-1", relationType: "blocks", delay: null }],
      otherIssues: [makeIssue({ id: "blocker-1", statusId: "new", priorityId: "normal" })],
    });

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
    ).rejects.toThrow(BlockedIssueCloseError);
    expect(repos.issueRepository.update).not.toHaveBeenCalled();
  });

  it("allows closing an issue whose blocker is already closed", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
      statuses: [
        { id: "closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: null, position: 1 },
        { id: "new", name: "New", description: "", isClosed: false, defaultDoneRatio: null, position: 0 },
      ],
      relations: [{ id: "rel-1", issueFromId: "blocker-1", issueToId: "issue-1", relationType: "blocks", delay: null }],
      otherIssues: [makeIssue({ id: "blocker-1", statusId: "closed", priorityId: "normal" })],
    });

    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(result.statusId).toBe("closed");
  });

  it("ignores a blocks relation pointing the other way (this issue blocking another, not blocked by it)", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" });
    const repos = makeRepositories({
      issue,
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
      statuses: [
        { id: "closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: null, position: 1 },
        { id: "new", name: "New", description: "", isClosed: false, defaultDoneRatio: null, position: 0 },
      ],
      // issue-1 blocks issue-2, not the other way around — must not block closing issue-1.
      relations: [{ id: "rel-1", issueFromId: "issue-1", issueToId: "issue-2", relationType: "blocks", delay: null }],
    });

    const result = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });
    expect(result.statusId).toBe("closed");
  });
});
