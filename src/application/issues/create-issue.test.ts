import { describe, expect, it, mock } from "bun:test";
import { createIssue, type CreateIssueInput } from "./create-issue";
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
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });

    const issue = await createIssue(
      {
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

  it("throws when the tracker does not exist", async () => {
    await expect(
      createIssue(
        {
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

  it("rejects a blank field the tracker's default status requires for this role", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
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
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
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
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });
    const watcherRepository = makeWatcherRepository();

    const issue = await createIssue(
      {
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
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });
    const watcherRepository = makeWatcherRepository();

    const issue = await createIssue(
      {
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
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
    const issueRepository = makeIssueRepositoryMock({
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
    });
    const watcherRepository = makeWatcherRepository();

    await createIssue(
      {
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
