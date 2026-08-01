import { describe, expect, it, mock } from "bun:test";
import { createIssue, type CreateIssueInput } from "./create-issue";
import { WorkflowRequiredFieldError } from "./update-issue";
import type { Issue } from "@/domain/issue/entity";
import { makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { Tracker } from "@/domain/tracker/entity";
import type { TrackerRepository } from "@/domain/tracker/repository";
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
      },
      { ...baseInput, dueDate: "2026-01-01" },
    );

    expect(issue.dueDate).toBe("2026-01-01");
  });
});
