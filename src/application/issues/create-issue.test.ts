import { describe, expect, it, mock } from "bun:test";
import { createIssue, type CreateIssueInput } from "./create-issue";
import { makeIssueAttributeRepositoriesMock, makeRollupRepositoriesMock } from "./test-support";
import { IssueAttributeNotAssignableError } from "./validate-issue-attributes";
import { WorkflowRequiredFieldError } from "./update-issue";
import type { Issue } from "@/domain/issue/entity";
import { makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { Tracker } from "@/domain/tracker/entity";
import type { TrackerRepository } from "@/domain/tracker/repository";
import type { UserPreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";
import type { WorkflowFieldPermission } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository } from "@/domain/workflow/repository";

const baseInput: CreateIssueInput = {
  projectId: "proj-1",
  trackerId: "tracker-1",
  priorityId: "normal",
  subject: "New bug",
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
  actorRoleIds: ["role-1"],
  canSetPrivate: true,
  canManageSubtasks: true,
};

function makeTrackerRepository(tracker: Tracker | null): TrackerRepository {
  return {
    findById: mock(async () => tracker),
    findByIds: mock(async () => (tracker ? [tracker] : [])),
    listAll: mock(async () => (tracker ? [tracker] : [])),
    create: mock(async () => {
      throw new Error("not used");
    }),
  };
}

function makeFieldPermissionRepository(permissions: WorkflowFieldPermission[] = []): WorkflowFieldPermissionRepository {
  return {
    listForTracker: mock(async () => permissions),
    listForTrackerAndRole: mock(async () => permissions),
    replaceForTrackerAndRole: mock(async () => undefined),
  };
}

function makeUserPreferencesRepository(): UserPreferencesRepository {
  return {
    findByUserId: mock(async () => null as UserPreferences | null),
    upsert: mock(async () => {}),
  };
}

function makeWatcherRepository() {
  return {
    isWatching: mock(async () => false),
    watch: mock(async () => {}),
    unwatch: mock(async () => {}),
    listWatchedIds: mock(async () => [] as string[]),
    listWatcherUserIds: mock(async () => [] as string[]),
    unwatchAll: mock(async () => {}),
  } satisfies WatcherRepository;
}

describe("createIssue", () => {
  it("defaults the status to the tracker's default status", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository: makeWatcherRepository(),
      },
      baseInput,
    );

    expect(issue.statusId).toBe("new");
    expect(issue.doneRatio).toBe(0);
  });

  it("rejects a tracker that is not enabled on the project", async () => {
    await expect(
      createIssue(
        {
          ...makeIssueAttributeRepositoriesMock({ trackerIds: ["tracker-1"] }),
          ...makeRollupRepositoriesMock(),
          issueRepository: makeIssueRepositoryMock(),
          trackerRepository: makeTrackerRepository(null),
          workflowFieldPermissionRepository: makeFieldPermissionRepository(),
          userPreferencesRepository: makeUserPreferencesRepository(),
          watcherRepository: makeWatcherRepository(),
        },
        { ...baseInput, trackerId: "tracker-2" },
      ),
    ).rejects.toThrow(IssueAttributeNotAssignableError);
  });

  it("throws when the tracker row is missing even though the project enables it", async () => {
    await expect(
      createIssue(
        {
          ...makeIssueAttributeRepositoriesMock({ trackerIds: ["missing"] }),
          ...makeRollupRepositoriesMock(),
          issueRepository: makeIssueRepositoryMock(),
          trackerRepository: makeTrackerRepository(null),
          workflowFieldPermissionRepository: makeFieldPermissionRepository(),
          userPreferencesRepository: makeUserPreferencesRepository(),
          watcherRepository: makeWatcherRepository(),
        },
        { ...baseInput, trackerId: "missing" },
      ),
    ).rejects.toThrow(/not found/);
  });

  it("rejects a priority that is not an IssuePriority enumeration", async () => {
    // The column's FK reaches `enumerations`, which also holds TimeEntryActivity rows — only
    // the type filter keeps an activity id out of an issue's priority.
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    await expect(
      createIssue(
        {
          ...makeIssueAttributeRepositoriesMock({ priorityIds: ["normal"] }),
          ...makeRollupRepositoriesMock(),
          issueRepository: makeIssueRepositoryMock(),
          trackerRepository: makeTrackerRepository(tracker),
          workflowFieldPermissionRepository: makeFieldPermissionRepository(),
          userPreferencesRepository: makeUserPreferencesRepository(),
          watcherRepository: makeWatcherRepository(),
        },
        { ...baseInput, priorityId: "an-activity-enumeration" },
      ),
    ).rejects.toThrow(IssueAttributeNotAssignableError);
  });

  it("rejects an assignee who is not an assignable member of the project", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    await expect(
      createIssue(
        {
          ...makeIssueAttributeRepositoriesMock({ members: [], roles: [], users: [] }),
          ...makeRollupRepositoriesMock(),
          issueRepository: makeIssueRepositoryMock(),
          trackerRepository: makeTrackerRepository(tracker),
          workflowFieldPermissionRepository: makeFieldPermissionRepository(),
          userPreferencesRepository: makeUserPreferencesRepository(),
          watcherRepository: makeWatcherRepository(),
        },
        { ...baseInput, assignedToId: "outsider", assignedToType: "user" },
      ),
    ).rejects.toThrow(IssueAttributeNotAssignableError);
  });

  it("rejects a category that belongs to another project", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    await expect(
      createIssue(
        {
          ...makeIssueAttributeRepositoriesMock({ categoryIds: ["category-here"] }),
          ...makeRollupRepositoriesMock(),
          issueRepository: makeIssueRepositoryMock(),
          trackerRepository: makeTrackerRepository(tracker),
          workflowFieldPermissionRepository: makeFieldPermissionRepository(),
          userPreferencesRepository: makeUserPreferencesRepository(),
          watcherRepository: makeWatcherRepository(),
        },
        { ...baseInput, categoryId: "category-elsewhere" },
      ),
    ).rejects.toThrow(IssueAttributeNotAssignableError);
  });

  it("rejects a blank field the tracker's default status requires for this role", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    const permission: WorkflowFieldPermission = {
      id: "fp-1",
      trackerId: "tracker-1",
      roleId: "role-1",
      statusId: "new",
      fieldName: "dueDate",
      rule: "required",
    };

    await expect(
      createIssue(
        {
          ...makeIssueAttributeRepositoriesMock(),
          ...makeRollupRepositoriesMock(),
          issueRepository: makeIssueRepositoryMock(),
          trackerRepository: makeTrackerRepository(tracker),
          workflowFieldPermissionRepository: makeFieldPermissionRepository([permission]),
          userPreferencesRepository: makeUserPreferencesRepository(),
          watcherRepository: makeWatcherRepository(),
        },
        { ...baseInput, dueDate: null },
      ),
    ).rejects.toThrow(WorkflowRequiredFieldError);
  });

  it("allows creation when the required field is filled", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    const permission: WorkflowFieldPermission = {
      id: "fp-1",
      trackerId: "tracker-1",
      roleId: "role-1",
      statusId: "new",
      fieldName: "dueDate",
      rule: "required",
    };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository([permission]),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository: makeWatcherRepository(),
      },
      { ...baseInput, dueDate: "2026-01-01" },
    );

    expect(issue.dueDate).toBe("2026-01-01");
  });

  it("auto-watches the issue for its author on creation", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });
    const watcherRepository = makeWatcherRepository();

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository,
      },
      baseInput,
    );

    expect(watcherRepository.watch).toHaveBeenCalledWith("Issue", issue.id, baseInput.authorId);
  });

  it("auto-watches the issue for a user assignee, but not a group assignee", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });
    const watcherRepository = makeWatcherRepository();

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository,
      },
      { ...baseInput, assignedToId: "user-2", assignedToType: "user" },
    );

    expect(watcherRepository.watch).toHaveBeenCalledWith("Issue", issue.id, "user-2");
    expect(watcherRepository.watch).toHaveBeenCalledWith("Issue", issue.id, baseInput.authorId);
    // Only the author (baseInput.authorId) and the assignee (user-2) should ever be watched —
    // a group assignedToId must never reach applyAutoWatch as if it were a user id.
    expect(watcherRepository.watch).toHaveBeenCalledTimes(2);
  });

  it("does not auto-watch for a group assignee", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true, disabledCoreFields: [] };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });
    const watcherRepository = makeWatcherRepository();

    await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository,
      },
      { ...baseInput, assignedToId: "group-1", assignedToType: "group" },
    );

    expect(watcherRepository.watch).not.toHaveBeenCalledWith("Issue", expect.anything(), "group-1");
  });
});

describe("createIssue — disabled core fields", () => {
  const tracker: Tracker = {
    id: "tracker-1",
    name: "Bug",
    defaultStatusId: "new",
    position: 1,
    isInRoadmap: true,
    disabledCoreFields: ["dueDate", "estimatedHours", "assignedToId"],
  };

  it("falls back to the default for every field the tracker switched off", async () => {
    // Mirrors `names -= disabled_core_fields` in safe_attribute_names: the value is dropped
    // rather than rejected, so the issue still saves.
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository: makeWatcherRepository(),
      },
      { ...baseInput, dueDate: "2026-05-01", estimatedHours: 8, assignedToId: "user-2", assignedToType: "user" },
    );

    expect(issue.dueDate).toBeNull();
    expect(issue.estimatedHours).toBeNull();
    expect(issue.assignedToId).toBeNull();
    expect(issue.assignedToType).toBeNull();
  });

  it("does not reject a stale id in a disabled field", async () => {
    // safe_attributes strips before assignment, so validation never sees the dropped value —
    // an assignee who is no longer assignable must not fail a save that discards them anyway.
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock({ members: [], roles: [], users: [] }),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository(tracker),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository: makeWatcherRepository(),
      },
      { ...baseInput, assignedToId: "no-longer-a-member", assignedToType: "user" },
    );

    expect(issue.assignedToId).toBeNull();
  });

  it("keeps fields the tracker still enables", async () => {
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });

    const issue = await createIssue(
      {
        ...makeIssueAttributeRepositoriesMock(),
        ...makeRollupRepositoriesMock(),
        issueRepository,
        trackerRepository: makeTrackerRepository({ ...tracker, disabledCoreFields: [] }),
        workflowFieldPermissionRepository: makeFieldPermissionRepository(),
        userPreferencesRepository: makeUserPreferencesRepository(),
        watcherRepository: makeWatcherRepository(),
      },
      { ...baseInput, dueDate: "2026-05-01", estimatedHours: 8 },
    );

    expect(issue.dueDate).toBe("2026-05-01");
    expect(issue.estimatedHours).toBe(8);
  });
});
