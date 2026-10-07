import { describe, expect, it, mock } from "bun:test";
import {
  BlockedIssueCloseError,
  InvalidParentIssueError,
  updateIssue,
  WorkflowRequiredFieldError,
  WorkflowTransitionDeniedError,
} from "./update-issue";
import { CustomFieldValidationError } from "./set-custom-field-values";
import { makeIssueAttributeRepositoriesMock } from "./test-support";
import { IssueAttributeNotAssignableError } from "./validate-issue-attributes";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValue } from "@/domain/custom-value/entity";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
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
    customFields?: CustomField[];
    customValues?: CustomValue[];
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
    create: mock(async (j) => ({ ...j, id: "journal-1", createdAt: new Date(), updatedAt: new Date(), updatedById: null })),
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => undefined),
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
    findByUserIds: mock(async () => []),
    upsertAccountPreferences: mock(async () => {}),
    upsert: mock(async () => undefined),
  };
  const watcherRepository = {
    isWatching: mock(async () => false),
    watch: mock(async () => undefined),
    unwatch: mock(async () => undefined),
    listWatchedIds: mock(async () => [] as string[]),
    listWatcherUserIds: mock(async () => [] as string[]),
    unwatchAll: mock(async () => {}),
  } satisfies WatcherRepository;
  const customFieldRepository: CustomFieldRepository = {
    listAll: mock(async () => overrides.customFields ?? []),
    listForTracker: mock(async () => overrides.customFields ?? []),
    listForCustomizedType: mock(async () => overrides.customFields ?? []),
    findById: mock(async (id) => (overrides.customFields ?? []).find((f) => f.id === id) ?? null),
    create: mock(async () => {
      throw new Error("not used");
    }),
  };
  const customValueRepository: CustomValueRepository = {
    listForCustomized: mock(async () => overrides.customValues ?? []),
    deleteForCustomized: mock(async () => {}),
    set: mock(async (customFieldId, customizedType, customizedId, value) => ({
      id: `cv-${customFieldId}`,
      customFieldId,
      customizedType,
      customizedId,
      value,
    })),
  };
  return {
    ...makeIssueAttributeRepositoriesMock(),
    issueRepository,
    journalRepository,
    workflowRepository,
    workflowFieldPermissionRepository,
    issueStatusRepository,
    issueRelationRepository,
    settingsRepository,
    userPreferencesRepository,
    watcherRepository,
    customFieldRepository,
    customValueRepository,
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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
    const { issue: result } = await updateIssue(repos, {
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

    const { issue: result } = await updateIssue(repos, {
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

    const { issue: result } = await updateIssue(repos, {
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

const NEW: IssueStatus = { id: "new", name: "New", description: "", isClosed: false, defaultDoneRatio: null, position: 0 };
const CLOSED: IssueStatus = { id: "closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: null, position: 1 };

/**
 * Multi-issue repository set for the close-duplicates cascade tests below — the shared
 * makeRepositories() above always resolves findById to a single fixed issue, which can't
 * represent a cascade touching several distinct issues at once.
 */
function makeCascadeRepositories(options: { issues: Issue[]; relations: IssueRelation[]; transitions?: unknown[] }) {
  const issuesById = new Map(options.issues.map((i) => [i.id, i]));
  const journalEntries: { journalizedId: string; userId: string; details: unknown[] }[] = [];

  const issueRepository = makeIssueRepositoryMock({
    findById: mock(async (id: string) => issuesById.get(id) ?? null),
    findByIds: mock(async (ids: string[]) => ids.map((id) => issuesById.get(id)).filter((i): i is Issue => !!i)),
    update: mock(async (id: string, _lockVersion: number, changes) => {
      const current = issuesById.get(id);
      if (!current) throw new Error("not found");
      const updated = { ...current, ...changes, lockVersion: current.lockVersion + 1 } as Issue;
      issuesById.set(id, updated);
      return updated;
    }),
  });
  const journalRepository: JournalRepository = {
    findById: mock(async () => null),
    listForIssue: mock(async () => []),
    listByProject: mock(async () => []),
    create: mock(async (j) => {
      journalEntries.push({ journalizedId: j.journalizedId, userId: j.userId, details: j.details });
      return { ...j, id: `journal-${journalEntries.length}`, createdAt: new Date(), updatedAt: new Date(), updatedById: null };
    }),
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => undefined),
  };
  const workflowRepository: WorkflowRepository = {
    listForTracker: mock(async () => (options.transitions as never) ?? []),
    listForTrackerAndRole: mock(async () => (options.transitions as never) ?? []),
    create: mock(async (t) => ({ ...t, id: "transition-1" })),
    replaceForTrackerAndRole: mock(async () => undefined),
  };
  const workflowFieldPermissionRepository: WorkflowFieldPermissionRepository = {
    listForTracker: mock(async () => []),
    listForTrackerAndRole: mock(async () => []),
    replaceForTrackerAndRole: mock(async () => undefined),
  };
  const statuses = [NEW, CLOSED];
  const issueStatusRepository: IssueStatusRepository = {
    findById: mock(async (id) => statuses.find((s) => s.id === id) ?? null),
    listAll: mock(async () => statuses),
    create: mock(async (s) => ({ ...s, id: "status-1" })),
  };
  const issueRelationRepository: IssueRelationRepository = {
    listForIssue: mock(async (issueId: string) => options.relations.filter((r) => r.issueFromId === issueId || r.issueToId === issueId)),
    findById: mock(async (id) => options.relations.find((r) => r.id === id) ?? null),
    create: mock(async (r) => ({ ...r, id: "relation-new" })),
    delete: mock(async () => undefined),
  };
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => ({})),
    setMany: mock(async () => undefined),
  };
  const userPreferencesRepository: UserPreferencesRepository = {
    findByUserId: mock(async () => null),
    findByUserIds: mock(async () => []),
    upsertAccountPreferences: mock(async () => {}),
    upsert: mock(async () => undefined),
  };
  const watcherRepository = {
    isWatching: mock(async () => false),
    watch: mock(async () => undefined),
    unwatch: mock(async () => undefined),
    listWatchedIds: mock(async () => [] as string[]),
    listWatcherUserIds: mock(async () => [] as string[]),
    unwatchAll: mock(async () => {}),
  } satisfies WatcherRepository;
  const customFieldRepository: CustomFieldRepository = {
    listAll: mock(async () => []),
    listForTracker: mock(async () => []),
    listForCustomizedType: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async () => {
      throw new Error("not used");
    }),
  };
  const customValueRepository: CustomValueRepository = {
    listForCustomized: mock(async () => []),
    deleteForCustomized: mock(async () => {}),
    set: mock(async () => {
      throw new Error("not used");
    }),
  };

  return {
    repos: {
      ...makeIssueAttributeRepositoriesMock(),
      issueRepository,
      journalRepository,
      workflowRepository,
      workflowFieldPermissionRepository,
      issueStatusRepository,
      issueRelationRepository,
      settingsRepository,
      userPreferencesRepository,
      watcherRepository,
      customFieldRepository,
      customValueRepository,
    },
    issuesById,
    journalEntries,
  };
}

function cascadeIssue(overrides: Partial<Issue> & { id: string }): Issue {
  return makeIssue({ statusId: "new", priorityId: "normal", ...overrides });
}

describe("updateIssue — close duplicates cascade", () => {
  it("closes a duplicate when the canonical issue closes, with a journal entry attributed to the acting user", async () => {
    const { repos, issuesById, journalEntries } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "canonical" }), cascadeIssue({ id: "dup" })],
      // dup duplicates canonical: canonical row points from the duplicate to what it duplicates.
      relations: [{ id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null }],
      transitions: [{ id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false }],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("dup")?.statusId).toBe("closed");
    const dupJournal = journalEntries.find((j) => j.journalizedId === "dup");
    expect(dupJournal?.userId).toBe("user-1");
  });

  it("cascades through a chain of duplicates", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "a" }), cascadeIssue({ id: "b" }), cascadeIssue({ id: "c" })],
      // b duplicates a, c duplicates b.
      relations: [
        { id: "rel-1", issueFromId: "b", issueToId: "a", relationType: "duplicates", delay: null },
        { id: "rel-2", issueFromId: "c", issueToId: "b", relationType: "duplicates", delay: null },
      ],
      transitions: [{ id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false }],
    });

    await updateIssue(repos, {
      issueId: "a",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("b")?.statusId).toBe("closed");
    expect(issuesById.get("c")?.statusId).toBe("closed");
  });

  it("leaves an already-closed duplicate untouched", async () => {
    const { repos, issuesById, journalEntries } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "canonical" }), cascadeIssue({ id: "dup", statusId: "closed" })],
      relations: [{ id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null }],
      transitions: [{ id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false }],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(journalEntries.find((j) => j.journalizedId === "dup")).toBeUndefined();
    expect(issuesById.get("dup")?.lockVersion).toBe(0);
  });

  it("closes a duplicate even though it is blocked by an open issue (bypasses the blocked check, matching Redmine's validation-skipping update_attribute)", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "canonical" }), cascadeIssue({ id: "dup" }), cascadeIssue({ id: "blocker" })],
      relations: [
        { id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null },
        { id: "rel-2", issueFromId: "blocker", issueToId: "dup", relationType: "blocks", delay: null },
      ],
      transitions: [{ id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false }],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("dup")?.statusId).toBe("closed");
  });

  it("closes a duplicate even with no workflow transition rule allowing it on the duplicate's own tracker (bypasses the transition check)", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      // dup is on tracker-2, which has no transition rule at all — only tracker-1 (canonical's
      // tracker) does. A non-cascade close of dup would be rejected by canTransitionTo.
      issues: [cascadeIssue({ id: "canonical", trackerId: "tracker-1" }), cascadeIssue({ id: "dup", trackerId: "tracker-2" })],
      relations: [{ id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null }],
      transitions: [{ id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false }],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("dup")?.statusId).toBe("closed");
  });

  it("does not cascade when the update doesn't actually reach a closed status", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "canonical" }), cascadeIssue({ id: "dup" })],
      relations: [{ id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null }],
      transitions: [{ id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false }],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { subject: "Renamed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("dup")?.statusId).toBe("new");
  });
});

describe("updateIssue — reschedule following issues", () => {
  it("pushes a successor forward when its predecessor's due date moves later", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "pred", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "succ", startDate: "2026-01-06", dueDate: "2026-01-10" }),
      ],
      relations: [{ id: "rel-1", issueFromId: "pred", issueToId: "succ", relationType: "precedes", delay: null }],
    });

    await updateIssue(repos, {
      issueId: "pred",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-15" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    // succ's 4-day duration (Jan 6-10) is preserved: new start is pred's new due (Jan 15) + 1.
    expect(issuesById.get("succ")?.startDate).toBe("2026-01-16");
    expect(issuesById.get("succ")?.dueDate).toBe("2026-01-20");
  });

  it("does not move a successor that already starts after the recomputed soonest start", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "pred", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "succ", startDate: "2026-02-01", dueDate: "2026-02-05" }),
      ],
      relations: [{ id: "rel-1", issueFromId: "pred", issueToId: "succ", relationType: "precedes", delay: null }],
    });

    await updateIssue(repos, {
      issueId: "pred",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-10" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("succ")?.startDate).toBe("2026-02-01");
    expect(issuesById.get("succ")?.dueDate).toBe("2026-02-05");
  });

  it("recomputes soonest start from every predecessor, not just the one that changed", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "pred-a", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "pred-b", startDate: "2026-01-01", dueDate: "2026-01-20" }),
        cascadeIssue({ id: "succ", startDate: "2026-01-06", dueDate: "2026-01-06" }),
      ],
      relations: [
        { id: "rel-1", issueFromId: "pred-a", issueToId: "succ", relationType: "precedes", delay: null },
        { id: "rel-2", issueFromId: "pred-b", issueToId: "succ", relationType: "precedes", delay: null },
      ],
    });

    // Nudge pred-a forward by a single day — pred-b (due Jan 20) still dominates, so succ
    // must land on Jan 21, not the day after pred-a's new due date.
    await updateIssue(repos, {
      issueId: "pred-a",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-06" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("succ")?.startDate).toBe("2026-01-21");
  });

  it("applies the relation's delay", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "pred", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "succ", startDate: "2026-01-06", dueDate: "2026-01-06" }),
      ],
      relations: [{ id: "rel-1", issueFromId: "pred", issueToId: "succ", relationType: "precedes", delay: 3 }],
    });

    await updateIssue(repos, {
      issueId: "pred",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-10" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("succ")?.startDate).toBe("2026-01-14");
  });

  it("cascades through a chain of precedes relations", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "a", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "b", startDate: "2026-01-06", dueDate: "2026-01-06" }),
        cascadeIssue({ id: "c", startDate: "2026-01-07", dueDate: "2026-01-07" }),
      ],
      relations: [
        { id: "rel-1", issueFromId: "a", issueToId: "b", relationType: "precedes", delay: null },
        { id: "rel-2", issueFromId: "b", issueToId: "c", relationType: "precedes", delay: null },
      ],
    });

    await updateIssue(repos, {
      issueId: "a",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-20" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("b")?.startDate).toBe("2026-01-21");
    expect(issuesById.get("c")?.startDate).toBe("2026-01-22");
  });

  it("records a journal entry on the successor attributed to the acting user", async () => {
    const { repos, issuesById, journalEntries } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "pred", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "succ", startDate: "2026-01-06", dueDate: "2026-01-06" }),
      ],
      relations: [{ id: "rel-1", issueFromId: "pred", issueToId: "succ", relationType: "precedes", delay: null }],
    });

    await updateIssue(repos, {
      issueId: "pred",
      expectedLockVersion: 0,
      changes: { dueDate: "2026-01-10" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("succ")?.startDate).toBe("2026-01-11");
    const succJournal = journalEntries.find((j) => j.journalizedId === "succ");
    expect(succJournal?.userId).toBe("user-1");
  });

  it("does not reschedule when the update leaves start/due dates untouched", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "pred", startDate: "2026-01-01", dueDate: "2026-01-05" }),
        cascadeIssue({ id: "succ", startDate: "2026-01-06", dueDate: "2026-01-06" }),
      ],
      relations: [{ id: "rel-1", issueFromId: "pred", issueToId: "succ", relationType: "precedes", delay: null }],
    });

    await updateIssue(repos, {
      issueId: "pred",
      expectedLockVersion: 0,
      changes: { subject: "Renamed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(issuesById.get("succ")?.startDate).toBe("2026-01-06");
  });
});

function customField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "cf-1",
    name: "Severity",
    customizedType: "Issue",
    fieldFormat: "list",
    isRequired: false,
    defaultValue: null,
    possibleValues: ["Low", "High"],
    position: 1,
    trackerIds: ["tracker-1"],
    ...overrides,
  };
}

describe("updateIssue — custom field values", () => {
  it("writes the value and journals it alongside the attribute changes in a single entry", async () => {
    const repos = makeRepositories({
      issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }),
      customFields: [customField()],
      customValues: [{ id: "cv-1", customFieldId: "cf-1", customizedType: "Issue", customizedId: "issue-1", value: "Low" }],
    });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      customFieldValues: { "cf-1": "High" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(repos.customValueRepository.set).toHaveBeenCalledWith("cf-1", "Issue", "issue-1", "High");
    expect(repos.journalRepository.create).toHaveBeenCalledTimes(1);
    const journal = (repos.journalRepository.create as ReturnType<typeof mock>).mock.calls[0][0];
    expect(journal.details).toEqual([
      { property: "attr", fieldName: "subject", oldValue: "Before", newValue: "After" },
      { property: "cf", fieldName: "cf-1", oldValue: "Low", newValue: "High" },
    ]);
  });

  it("records nothing for a custom value that is resubmitted unchanged", async () => {
    const repos = makeRepositories({
      issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" }),
      customFields: [customField()],
      customValues: [{ id: "cv-1", customFieldId: "cf-1", customizedType: "Issue", customizedId: "issue-1", value: "Low" }],
    });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: {},
      customFieldValues: { "cf-1": "Low" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
    expect(repos.journalRepository.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid custom value before the issue row is written, leaving no partial update", async () => {
    const repos = makeRepositories({
      issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }),
      customFields: [customField()],
    });

    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { subject: "After" },
        customFieldValues: { "cf-1": "Critical" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
      }),
    ).rejects.toThrow(CustomFieldValidationError);

    expect(repos.issueRepository.update).not.toHaveBeenCalled();
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("resolves the applicable fields against the tracker the update switches to", async () => {
    const repos = makeRepositories({
      issue: makeIssue({ id: "issue-1", trackerId: "tracker-1", statusId: "new", priorityId: "normal" }),
      customFields: [customField({ trackerIds: ["tracker-2"] })],
    });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { trackerId: "tracker-2" },
      customFieldValues: { "cf-1": "High" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(repos.customFieldRepository.listForTracker).toHaveBeenCalledWith("tracker-2");
  });
});

describe("updateIssue — tracker changes", () => {
  it("validates the status transition against the tracker the update switches to", async () => {
    // Mirrors Issue#safe_attributes=, which assigns tracker_id before resolving the workflow:
    // the transition exists for tracker-2 only, so the same request must be allowed.
    const repos = makeRepositories({
      issue: makeIssue({ id: "issue-1", trackerId: "tracker-1", statusId: "new", priorityId: "normal" }),
      transitions: [
        { id: "t1", trackerId: "tracker-2", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
      statuses: [{ id: "closed", name: "Closed", description: "", isClosed: false, defaultDoneRatio: null, position: 2 }],
    });

    const { issue: result } = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { trackerId: "tracker-2", statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(result.statusId).toBe("closed");
    expect(repos.workflowRepository.listForTracker).toHaveBeenCalledWith("tracker-2");
  });

  it("rejects a transition that only the tracker being left behind allowed", async () => {
    const repos = makeRepositories({
      issue: makeIssue({ id: "issue-1", trackerId: "tracker-1", statusId: "new", priorityId: "normal" }),
      transitions: [
        { id: "t1", trackerId: "tracker-1", roleId: "role-1", oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
      ],
    });

    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { trackerId: "tracker-2", statusId: "closed" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
      }),
    ).rejects.toThrow(WorkflowTransitionDeniedError);
  });
});

describe("updateIssue — parent issue invariants", () => {
  function makeParentRepositories(projectIssues: Issue[], target: Issue) {
    const repos = makeRepositories({ issue: target });
    repos.issueRepository.listByProject = mock(async () => projectIssues);
    repos.issueRepository.findById = mock(async (id: string) => projectIssues.find((i) => i.id === id) ?? null);
    return repos;
  }

  it("accepts a parent in the same project", async () => {
    const target = makeIssue({ id: "child", projectId: "proj-1", statusId: "new", priorityId: "normal" });
    const parent = makeIssue({ id: "parent", projectId: "proj-1" });
    const repos = makeParentRepositories([target, parent], target);

    const { issue: result } = await updateIssue(repos, {
      issueId: "child",
      expectedLockVersion: 0,
      changes: { parentId: "parent" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canManageSubtasks: true,
    });

    expect(result.parentId).toBe("parent");
  });

  it("rejects a parent that lives in another project", async () => {
    // The parent_id column's FK only guarantees the row exists — nothing stops it pointing
    // at another project's issue, which would pull a subtree across a permission boundary.
    const target = makeIssue({ id: "child", projectId: "proj-1", statusId: "new", priorityId: "normal" });
    const foreign = makeIssue({ id: "foreign", projectId: "proj-2" });
    const repos = makeRepositories({ issue: target });
    repos.issueRepository.listByProject = mock(async () => [target]);
    repos.issueRepository.findById = mock(async (id: string) => [target, foreign].find((i) => i.id === id) ?? null);

    await expect(
      updateIssue(repos, {
        issueId: "child",
        expectedLockVersion: 0,
        changes: { parentId: "foreign" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
        canManageSubtasks: true,
      }),
    ).rejects.toThrow(InvalidParentIssueError);
    expect(repos.issueRepository.update).not.toHaveBeenCalled();
  });

  it("rejects an issue being made its own parent", async () => {
    const target = makeIssue({ id: "child", projectId: "proj-1", statusId: "new", priorityId: "normal" });
    const repos = makeParentRepositories([target], target);

    await expect(
      updateIssue(repos, {
        issueId: "child",
        expectedLockVersion: 0,
        changes: { parentId: "child" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
        canManageSubtasks: true,
      }),
    ).rejects.toThrow(InvalidParentIssueError);
    expect(repos.issueRepository.update).not.toHaveBeenCalled();
  });

  it("rejects re-parenting under one of its own descendants", async () => {
    const root = makeIssue({ id: "root", projectId: "proj-1", statusId: "new", priorityId: "normal" });
    const child = makeIssue({ id: "child", projectId: "proj-1", parentId: "root" });
    const grandchild = makeIssue({ id: "grandchild", projectId: "proj-1", parentId: "child" });
    const repos = makeParentRepositories([root, child, grandchild], root);

    await expect(
      updateIssue(repos, {
        issueId: "root",
        expectedLockVersion: 0,
        changes: { parentId: "grandchild" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
        canManageSubtasks: true,
      }),
    ).rejects.toThrow(InvalidParentIssueError);
    expect(repos.issueRepository.update).not.toHaveBeenCalled();
  });

  it("allows clearing the parent without any lookup", async () => {
    const target = makeIssue({ id: "child", projectId: "proj-1", parentId: "parent", statusId: "new", priorityId: "normal" });
    const repos = makeRepositories({ issue: target });

    const { issue: result } = await updateIssue(repos, {
      issueId: "child",
      expectedLockVersion: 0,
      changes: { parentId: null },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canManageSubtasks: true,
    });

    expect(result.parentId).toBeNull();
    expect(repos.issueRepository.listByProject).not.toHaveBeenCalled();
  });
});

describe("updateIssue — assignable attribute validation", () => {
  it("rejects a version that is not shared with the issue's project", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" }) });
    Object.assign(repos, makeIssueAttributeRepositoriesMock({ versionIds: ["version-shared"] }));

    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { fixedVersionId: "version-elsewhere" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
      }),
    ).rejects.toThrow(IssueAttributeNotAssignableError);
    expect(repos.issueRepository.update).not.toHaveBeenCalled();
  });

  it("leaves an unchanged assignee who has since left the project alone", async () => {
    // Regression: re-validating values this request doesn't touch made an issue whose
    // assignee left unsavable. Redmine guards the same validations with `_changed?`.
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", assignedToId: "departed", assignedToType: "user" });
    const repos = makeRepositories({ issue });
    Object.assign(repos, makeIssueAttributeRepositoriesMock({ members: [], roles: [], users: [] }));

    const { issue: result } = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "Still editable", assignedToId: "departed", assignedToType: "user" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(result.subject).toBe("Still editable");
  });

  it("still accepts re-assigning back to the stored assignee's id after they lost membership", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", assignedToId: "departed", assignedToType: "user" });
    const repos = makeRepositories({ issue });
    Object.assign(repos, makeIssueAttributeRepositoriesMock({ members: [], roles: [], users: [] }));

    await expect(
      updateIssue(repos, {
        issueId: "issue-1",
        expectedLockVersion: 0,
        changes: { assignedToId: "someone-else", assignedToType: "user" },
        notes: "",
        actingUserId: "user-1",
        actorRoleIds: ["role-1"],
        isAuthor: false,
        isAssignee: false,
      }),
    ).rejects.toThrow(IssueAttributeNotAssignableError);
  });
});

describe("updateIssue — permission-gated attributes", () => {
  it("drops is_private when the actor holds neither set_issues_private permission", async () => {
    // Mirrors Redmine's safe_attributes, which omits the attribute rather than refusing
    // the save, so an edit that also touches other fields still goes through.
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", isPrivate: false });
    const repos = makeRepositories({ issue });

    const { issue: result } = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "Edited", isPrivate: true },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canSetPrivate: false,
    });

    expect(result.isPrivate).toBe(false);
    expect(result.subject).toBe("Edited");
  });

  it("applies is_private when the actor is allowed to set it", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", isPrivate: false });
    const repos = makeRepositories({ issue });

    const { issue: result } = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { isPrivate: true },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canSetPrivate: true,
    });

    expect(result.isPrivate).toBe(true);
  });

  it("drops parentId without manage_subtasks, leaving the existing parent in place", async () => {
    const issue = makeIssue({ id: "child", projectId: "proj-1", statusId: "new", priorityId: "normal", parentId: "old-parent" });
    const repos = makeRepositories({ issue });

    const { issue: result } = await updateIssue(repos, {
      issueId: "child",
      expectedLockVersion: 0,
      changes: { parentId: "new-parent" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canManageSubtasks: false,
    });

    expect(result.parentId).toBe("old-parent");
    expect(repos.issueRepository.listByProject).not.toHaveBeenCalled();
  });
});

describe("updateIssue — notes-only updates", () => {
  it("records the note but no attribute change for a notes-only actor", async () => {
    // Redmine gates the whole safe_attributes block on attributes_editable? while `notes`
    // rides on notes_addable?, so add_issue_notes alone is a comment and nothing more.
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Untouched" });
    const repos = makeRepositories({ issue });

    const { issue: result } = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "Hijacked", doneRatio: 90 },
      customFieldValues: { "cf-1": "nope" },
      notes: "just a comment",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: false,
      canAddNotes: true,
    });

    expect(result.subject).toBe("Untouched");
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
    const journal = (repos.journalRepository.create as ReturnType<typeof mock>).mock.calls[0][0];
    expect(journal.notes).toBe("just a comment");
    expect(journal.details).toEqual([]);
  });

  it("drops the note from an actor who may edit but not comment", async () => {
    const issue = makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" });
    const repos = makeRepositories({ issue });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      notes: "should not be stored",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: true,
      canAddNotes: false,
    });

    const journal = (repos.journalRepository.create as ReturnType<typeof mock>).mock.calls[0][0];
    expect(journal.notes).toBe("");
    expect(journal.details).toHaveLength(1);
  });

  it("writes nothing at all when the actor may neither edit nor comment", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" }) });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "nope" },
      notes: "nope",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: false,
      canAddNotes: false,
    });

    expect(repos.journalRepository.create).not.toHaveBeenCalled();
  });
});

describe("updateIssue — private notes", () => {
  function journalsCreated(repos: ReturnType<typeof makeRepositories>) {
    return (repos.journalRepository.create as ReturnType<typeof mock>).mock.calls.map((call) => call[0]);
  }

  it("ignores the private flag without set_notes_private", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" }) });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: {},
      notes: "secret",
      privateNotes: true,
      canSetNotesPrivate: false,
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(journalsCreated(repos)[0].privateNotes).toBe(false);
  });

  it("marks a note private with the permission", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" }) });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: {},
      notes: "secret",
      privateNotes: true,
      canSetNotesPrivate: true,
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    const created = journalsCreated(repos);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ notes: "secret", privateNotes: true });
  });

  it("splits a private note that accompanies an attribute change, keeping the change public", async () => {
    // Redmine's split_private_notes: otherwise marking the note private would also hide the
    // subject change from everyone without view_private_notes.
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }) });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      notes: "secret",
      privateNotes: true,
      canSetNotesPrivate: true,
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    const created = journalsCreated(repos);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ notes: "", privateNotes: false });
    expect(created[0].details).toHaveLength(1);
    expect(created[1]).toMatchObject({ notes: "secret", privateNotes: true });
    expect(created[1].details).toEqual([]);
  });

  it("does not mark an attribute-only change private", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }) });

    await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      notes: "",
      privateNotes: true,
      canSetNotesPrivate: true,
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    const created = journalsCreated(repos);
    expect(created).toHaveLength(1);
    expect(created[0].privateNotes).toBe(false);
  });
});

describe("updateIssue — a notes-only actor cannot drive the cascades", () => {
  it("does not close duplicates when a notes-only actor echoes the issue's current closed status", async () => {
    // Regression: the cascade triggers used to read the raw payload, so submitting a
    // statusId equal to the issue's existing (closed) status satisfied
    // `after.statusId === input.changes.statusId` even though the change was stripped —
    // closing every duplicate of it with no permission to change anything.
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "canonical", statusId: "closed" }), cascadeIssue({ id: "dup" })],
      relations: [{ id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null }],
      transitions: [],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "just commenting",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: false,
      canAddNotes: true,
    });

    expect(issuesById.get("dup")?.statusId).toBe("new");
  });

  it("does not reschedule successors when a notes-only actor echoes the issue's current dates", async () => {
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [
        cascadeIssue({ id: "predecessor", startDate: "2026-01-01", dueDate: "2026-01-10" }),
        // Starts before the predecessor's due date, so a cascade would actually move it.
        cascadeIssue({ id: "successor", startDate: "2026-01-05", dueDate: "2026-01-20" }),
      ],
      relations: [{ id: "rel-1", issueFromId: "predecessor", issueToId: "successor", relationType: "precedes", delay: 0 }],
      transitions: [],
    });

    await updateIssue(repos, {
      issueId: "predecessor",
      expectedLockVersion: 0,
      changes: { startDate: "2026-01-01", dueDate: "2026-01-10" },
      notes: "just commenting",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: false,
      canAddNotes: true,
    });

    expect(issuesById.get("successor")?.startDate).toBe("2026-01-05");
  });

  it("does not close duplicates on a status the workflow stripped as read-only", async () => {
    // The same class of bug for an ordinary editor: a field dropped by a read-only rule
    // must not trigger a cascade either.
    const { repos, issuesById } = makeCascadeRepositories({
      issues: [cascadeIssue({ id: "canonical", statusId: "closed" }), cascadeIssue({ id: "dup" })],
      relations: [{ id: "rel-1", issueFromId: "dup", issueToId: "canonical", relationType: "duplicates", delay: null }],
      transitions: [],
    });

    await updateIssue(repos, {
      issueId: "canonical",
      expectedLockVersion: 0,
      changes: { statusId: "closed" },
      notes: "",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: false,
      canAddNotes: false,
    });

    expect(issuesById.get("dup")?.statusId).toBe("new");
  });
});

describe("updateIssue — what the caller may notify about", () => {
  it("reports no persisted note when the actor may not add one", async () => {
    // Regression: the notification body was built from the request, so an attribute-only
    // editor's dropped note was still mailed to every recipient — delivered to inboxes
    // while leaving nothing in the history to audit.
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }) });

    const outcome = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      notes: "should never be mailed",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canEditAttributes: true,
      canAddNotes: false,
    });

    expect(outcome.persistedNotes).toBe("");
    expect(outcome.persistedNotesPrivate).toBe(false);
  });

  it("reports the note it stored", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal" }) });

    const outcome = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: {},
      notes: "a real comment",
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
      canAddNotes: true,
    });

    expect(outcome.persistedNotes).toBe("a real comment");
    expect(outcome.persistedNotesPrivate).toBe(false);
  });

  it("reports a note as private only once it was stored private", async () => {
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }) });

    const outcome = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      notes: "secret",
      privateNotes: true,
      canSetNotesPrivate: true,
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    // The split puts the details in a public journal and the note in a private one; the
    // caller must mail the note only to view_private_notes holders.
    expect(outcome.persistedNotes).toBe("secret");
    expect(outcome.persistedNotesPrivate).toBe(true);
  });

  it("does not report a private note the actor was not allowed to add", async () => {
    // canSetNotesPrivate without canAddNotes previously still routed a never-stored note
    // to the private-notes recipients.
    const repos = makeRepositories({ issue: makeIssue({ id: "issue-1", statusId: "new", priorityId: "normal", subject: "Before" }) });

    const outcome = await updateIssue(repos, {
      issueId: "issue-1",
      expectedLockVersion: 0,
      changes: { subject: "After" },
      notes: "secret",
      privateNotes: true,
      canSetNotesPrivate: true,
      canAddNotes: false,
      actingUserId: "user-1",
      actorRoleIds: ["role-1"],
      isAuthor: false,
      isAssignee: false,
    });

    expect(outcome.persistedNotes).toBe("");
    expect(outcome.persistedNotesPrivate).toBe(false);
  });
});
