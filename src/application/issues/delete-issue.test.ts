import { describe, expect, it, mock } from "bun:test";
import {
  deleteIssue,
  DeleteIssueNotPermittedError,
  InvalidTimeEntryTargetError,
  type DeleteIssueRepositories,
} from "./delete-issue";
import type { Attachment } from "@/domain/attachment/entity";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { Project } from "@/domain/project/entity";

const deleter: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["delete_issues"], issuesVisibility: "all" }],
};
const viewer: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["view_issues"], issuesVisibility: "all" }],
};

function makeRepositories(options: { issues: Issue[]; attachments?: Attachment[]; project?: Partial<Project> }) {
  const issuesById = new Map(options.issues.map((issue) => [issue.id, issue]));
  const deleted: string[][] = [];
  const storageDeletes: string[] = [];
  const timeEntryCalls: { method: string; args: unknown[] }[] = [];

  const timeEntryRepository = {
    deleteForIssues: mock(async (...args: unknown[]) => {
      timeEntryCalls.push({ method: "deleteForIssues", args });
    }),
    detachFromIssues: mock(async (...args: unknown[]) => {
      timeEntryCalls.push({ method: "detachFromIssues", args });
    }),
    reassignToIssue: mock(async (...args: unknown[]) => {
      timeEntryCalls.push({ method: "reassignToIssue", args });
    }),
  };

  const repositories: DeleteIssueRepositories = {
    issueRepository: makeIssueRepositoryMock({
      findById: mock(async (id: string) => issuesById.get(id) ?? null),
      listByProject: mock(async (projectId: string) => [...issuesById.values()].filter((i) => i.projectId === projectId)),
      deleteWithDependents: mock(async (ids: string[]) => {
        deleted.push(ids);
      }),
    }),
    projectRepository: {
      findById: mock(
        async (id: string) =>
          ({ id, status: "active", isPublic: true, enabledModules: ["issue_tracking"], ...options.project }) as unknown as Project,
      ),
    } as unknown as DeleteIssueRepositories["projectRepository"],
    timeEntryRepository: timeEntryRepository as unknown as DeleteIssueRepositories["timeEntryRepository"],
    attachmentRepository: {
      listByContainers: mock(async () => options.attachments ?? []),
    } as unknown as DeleteIssueRepositories["attachmentRepository"],
    attachmentStorage: {
      delete: mock(async (key: string) => {
        storageDeletes.push(key);
      }),
    } as unknown as DeleteIssueRepositories["attachmentStorage"],
  };

  return { repositories, deleted, storageDeletes, timeEntryCalls };
}

const target = makeIssue({ id: "issue-1", projectId: "proj-1" });

describe("deleteIssue", () => {
  it("refuses a caller without delete_issues", async () => {
    const { repositories, deleted } = makeRepositories({ issues: [target] });

    await expect(deleteIssue(repositories, { issueId: "issue-1", actingUserId: "user-1", actor: viewer })).rejects.toThrow(
      DeleteIssueNotPermittedError,
    );
    expect(deleted).toEqual([]);
  });

  it("refuses on a closed project, where no non-read-only permission applies", async () => {
    const { repositories } = makeRepositories({ issues: [target], project: { status: "closed" } });

    await expect(deleteIssue(repositories, { issueId: "issue-1", actingUserId: "user-1", actor: deleter })).rejects.toThrow(
      DeleteIssueNotPermittedError,
    );
  });

  it("refuses to delete a private issue the actor cannot see", async () => {
    const hidden = makeIssue({ id: "issue-1", projectId: "proj-1", isPrivate: true, authorId: "someone-else" });
    const restricted: AuthorizationActor = {
      kind: "member",
      roles: [{ builtin: 0, permissions: ["delete_issues"], issuesVisibility: "default" }],
    };
    const { repositories, deleted } = makeRepositories({ issues: [hidden] });

    await expect(deleteIssue(repositories, { issueId: "issue-1", actingUserId: "user-1", actor: restricted })).rejects.toThrow(
      DeleteIssueNotPermittedError,
    );
    expect(deleted).toEqual([]);
  });

  it("deletes the issue together with its whole subtree", async () => {
    // issues.parent_id is ON DELETE SET NULL, so descendants have to be named explicitly —
    // Redmine deletes Issue.self_and_descendants.
    const parent = makeIssue({ id: "parent", projectId: "proj-1" });
    const child = makeIssue({ id: "child", projectId: "proj-1", parentId: "parent" });
    const grandchild = makeIssue({ id: "grandchild", projectId: "proj-1", parentId: "child" });
    const bystander = makeIssue({ id: "bystander", projectId: "proj-1" });
    const { repositories, deleted } = makeRepositories({ issues: [parent, child, grandchild, bystander] });

    const result = await deleteIssue(repositories, { issueId: "parent", actingUserId: "user-1", actor: deleter });

    expect(new Set(result.deletedIssueIds)).toEqual(new Set(["parent", "child", "grandchild"]));
    expect(new Set(deleted[0])).toEqual(new Set(["parent", "child", "grandchild"]));
  });

  it("destroys logged time by default, matching Redmine's dependent: :destroy", async () => {
    const { repositories, timeEntryCalls } = makeRepositories({ issues: [target] });

    await deleteIssue(repositories, { issueId: "issue-1", actingUserId: "user-1", actor: deleter });

    expect(timeEntryCalls.map((call) => call.method)).toEqual(["deleteForIssues"]);
  });

  it("detaches logged time under the nullify disposition", async () => {
    const { repositories, timeEntryCalls } = makeRepositories({ issues: [target] });

    await deleteIssue(repositories, {
      issueId: "issue-1",
      actingUserId: "user-1",
      actor: deleter,
      timeEntries: { mode: "nullify" },
    });

    expect(timeEntryCalls[0].method).toBe("detachFromIssues");
  });

  it("reassigns logged time to another issue in the same project", async () => {
    const other = makeIssue({ id: "other", projectId: "proj-1" });
    const { repositories, timeEntryCalls } = makeRepositories({ issues: [target, other] });

    await deleteIssue(repositories, {
      issueId: "issue-1",
      actingUserId: "user-1",
      actor: deleter,
      timeEntries: { mode: "reassign", targetIssueId: "other" },
    });

    expect(timeEntryCalls[0]).toEqual({ method: "reassignToIssue", args: [["issue-1"], "other", "proj-1"] });
  });

  it("rejects reassigning time to an issue in another project", async () => {
    const elsewhere = makeIssue({ id: "elsewhere", projectId: "proj-2" });
    const { repositories, deleted } = makeRepositories({ issues: [target, elsewhere] });

    await expect(
      deleteIssue(repositories, {
        issueId: "issue-1",
        actingUserId: "user-1",
        actor: deleter,
        timeEntries: { mode: "reassign", targetIssueId: "elsewhere" },
      }),
    ).rejects.toThrow(InvalidTimeEntryTargetError);
    expect(deleted).toEqual([]);
  });

  it("rejects reassigning time to an issue that is itself being deleted", async () => {
    const parent = makeIssue({ id: "parent", projectId: "proj-1" });
    const child = makeIssue({ id: "child", projectId: "proj-1", parentId: "parent" });
    const { repositories, deleted } = makeRepositories({ issues: [parent, child] });

    await expect(
      deleteIssue(repositories, {
        issueId: "parent",
        actingUserId: "user-1",
        actor: deleter,
        timeEntries: { mode: "reassign", targetIssueId: "child" },
      }),
    ).rejects.toThrow(InvalidTimeEntryTargetError);
    expect(deleted).toEqual([]);
  });

  it("removes attachment files from storage after the rows are gone", async () => {
    const attachment = { id: "a-1", storageKey: "key-1" } as Attachment;
    const { repositories, storageDeletes } = makeRepositories({ issues: [target], attachments: [attachment] });

    const result = await deleteIssue(repositories, { issueId: "issue-1", actingUserId: "user-1", actor: deleter });

    expect(result.removedStorageKeys).toEqual(["key-1"]);
    expect(storageDeletes).toEqual(["key-1"]);
  });

  it("still reports success when a stored file is already missing", async () => {
    const attachment = { id: "a-1", storageKey: "key-gone" } as Attachment;
    const { repositories } = makeRepositories({ issues: [target], attachments: [attachment] });
    repositories.attachmentStorage.delete = mock(async () => {
      throw new Error("ENOENT");
    });

    const result = await deleteIssue(repositories, { issueId: "issue-1", actingUserId: "user-1", actor: deleter });

    expect(result.deletedIssueIds).toEqual(["issue-1"]);
  });
});

describe("deleteIssue — reassign target visibility", () => {
  const restrictedDeleter: AuthorizationActor = {
    kind: "member",
    roles: [{ builtin: 0, permissions: ["delete_issues"], issuesVisibility: "default" }],
  };

  it("rejects reassigning time to a private issue the actor cannot see", async () => {
    // Otherwise the actor could park hours on an issue invisible to them, and tell from the
    // outcome that the id exists.
    const hidden = makeIssue({ id: "hidden", projectId: "proj-1", isPrivate: true, authorId: "someone-else" });
    const { repositories, deleted } = makeRepositories({ issues: [target, hidden] });

    await expect(
      deleteIssue(repositories, {
        issueId: "issue-1",
        actingUserId: "user-1",
        actor: restrictedDeleter,
        timeEntries: { mode: "reassign", targetIssueId: "hidden" },
      }),
    ).rejects.toThrow(InvalidTimeEntryTargetError);
    expect(deleted).toEqual([]);
  });

  it("reports an invisible target the same way as a missing one", async () => {
    const hidden = makeIssue({ id: "hidden", projectId: "proj-1", isPrivate: true, authorId: "someone-else" });
    const { repositories } = makeRepositories({ issues: [target, hidden] });

    const invisible = await deleteIssue(repositories, {
      issueId: "issue-1",
      actingUserId: "user-1",
      actor: restrictedDeleter,
      timeEntries: { mode: "reassign", targetIssueId: "hidden" },
    }).catch((error: InvalidTimeEntryTargetError) => error.reason);
    const missing = await deleteIssue(repositories, {
      issueId: "issue-1",
      actingUserId: "user-1",
      actor: restrictedDeleter,
      timeEntries: { mode: "reassign", targetIssueId: "00000000-0000-0000-0000-000000000000" },
    }).catch((error: InvalidTimeEntryTargetError) => error.reason);

    expect(invisible).toBe("not_found");
    expect(missing).toBe("not_found");
  });

  it("allows reassigning to the actor's own private issue", async () => {
    const own = makeIssue({ id: "own", projectId: "proj-1", isPrivate: true, authorId: "user-1" });
    const { repositories, timeEntryCalls } = makeRepositories({ issues: [target, own] });

    await deleteIssue(repositories, {
      issueId: "issue-1",
      actingUserId: "user-1",
      actor: restrictedDeleter,
      timeEntries: { mode: "reassign", targetIssueId: "own" },
    });

    expect(timeEntryCalls[0]).toEqual({ method: "reassignToIssue", args: [["issue-1"], "own", "proj-1"] });
  });

  it("rejects a descendant deeper than a direct child as the reassign target", async () => {
    const parent = makeIssue({ id: "parent", projectId: "proj-1" });
    const child = makeIssue({ id: "child", projectId: "proj-1", parentId: "parent" });
    const grandchild = makeIssue({ id: "grandchild", projectId: "proj-1", parentId: "child" });
    const { repositories, deleted } = makeRepositories({ issues: [parent, child, grandchild] });

    const reason = await deleteIssue(repositories, {
      issueId: "parent",
      actingUserId: "user-1",
      actor: deleter,
      timeEntries: { mode: "reassign", targetIssueId: "grandchild" },
    }).catch((error: InvalidTimeEntryTargetError) => error.reason);

    expect(reason).toBe("being_deleted");
    expect(deleted).toEqual([]);
  });
});
