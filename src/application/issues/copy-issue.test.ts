import { describe, expect, it, mock } from "bun:test";
import { copyIssue, CopyIssueNotPermittedError, type CopyIssueRepositories } from "./copy-issue";
import { makeIssueAttributeRepositoriesMock } from "./test-support";
import type { Attachment } from "@/domain/attachment/entity";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { CustomValue } from "@/domain/custom-value/entity";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";
import type { User } from "@/domain/user/entity";
import type { Version } from "@/domain/version/entity";

const copier: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["copy_issues", "add_issues"], issuesVisibility: "all", timeEntriesVisibility: "all" }],
};
const viewer: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["view_issues"], issuesVisibility: "all", timeEntriesVisibility: "all" }],
};

function makeRepositories(options: {
  issues: Issue[];
  versions?: Version[];
  customValues?: CustomValue[];
  attachments?: Attachment[];
  watcherUserIds?: string[];
  users?: Pick<User, "id" | "status">[];
  settings?: Record<string, string>;
}) {
  const created: Issue[] = [];
  const relations: IssueRelation[] = [];
  const watched: { issueId: string; userId: string }[] = [];
  const savedAttachments: { containerId: string; filename: string; storageKey: string }[] = [];
  const customValueWrites: { issueId: string; fieldId: string; value: string | null }[] = [];
  const issuesById = new Map(options.issues.map((issue) => [issue.id, issue]));

  const repositories = {
    ...makeIssueAttributeRepositoriesMock({
      users: options.users ?? [{ id: "user-1", status: "active" }],
      members: [{ userId: "user-1", groupId: null, roleIds: ["role-assignable"] }],
      roles: [{ id: "role-assignable", assignable: true }],
    }),
    issueRepository: makeIssueRepositoryMock({
      findById: mock(async (id: string) => issuesById.get(id) ?? null),
      listByProject: mock(async (projectId: string) => [...issuesById.values()].filter((i) => i.projectId === projectId)),
      create: mock(async (issue) => {
        const made = { ...issue, id: `copy-${created.length + 1}`, lockVersion: 0, createdAt: new Date(), updatedAt: new Date() } as Issue;
        created.push(made);
        issuesById.set(made.id, made);
        return made;
      }),
    }),
    projectRepository: {
      findById: mock(
        async (id: string) =>
          ({ id, status: "active", isPublic: true, enabledModules: ["issue_tracking"], trackerIds: ["tracker-1"] }) as unknown as Project,
      ),
    },
    trackerRepository: {
      findById: mock(async (id: string) => ({ id, name: "T", defaultStatusId: "new", position: 1, isInRoadmap: true }) as Tracker),
    },
    issueCategoryRepository: { listByProject: mock(async () => []) },
    versionRepository: { listSharedWith: mock(async () => options.versions ?? []) },
    issueRelationRepository: {
      listForIssue: mock(async () => relations),
      create: mock(async (relation) => {
        const made = { ...relation, id: `rel-${relations.length + 1}` } as IssueRelation;
        relations.push(made);
        return made;
      }),
    },
    customFieldRepository: { listForTracker: mock(async () => [{ id: "cf-1", name: "CF", fieldFormat: "string", isRequired: false, possibleValues: [] }]) },
    customValueRepository: {
      listForCustomized: mock(async (_type: string, id: string) => (id === "source" ? (options.customValues ?? []) : [])),
      set: mock(async (fieldId: string, _type: string, issueId: string, value: string | null) => {
        customValueWrites.push({ issueId, fieldId, value });
        return {} as CustomValue;
      }),
    },
    attachmentRepository: {
      listByContainer: mock(async (_type: string, id: string) => (options.attachments ?? []).filter(() => id === "source")),
      create: mock(async (attachment) => {
        savedAttachments.push({ containerId: attachment.containerId!, filename: attachment.filename, storageKey: attachment.storageKey });
        return {} as Attachment;
      }),
    },
    attachmentStorage: {
      read: mock(async () => Buffer.from("bytes")),
      save: mock(async () => `key-${savedAttachments.length + 1}`),
      delete: mock(async () => undefined),
    },
    workflowFieldPermissionRepository: { listForTracker: mock(async () => []) },
    userPreferencesRepository: { findByUserId: mock(async () => null), upsert: mock(async () => undefined) },
    watcherRepository: {
      listWatcherUserIds: mock(async () => options.watcherUserIds ?? []),
      watch: mock(async (_type: string, issueId: string, userId: string) => {
        watched.push({ issueId, userId });
      }),
      isWatching: mock(async () => false),
      unwatch: mock(async () => undefined),
      listWatchedIds: mock(async () => []),
    },
    settingsRepository: { getAll: mock(async () => options.settings ?? {}) },
  } as unknown as CopyIssueRepositories;

  return { repositories, created, relations, watched, savedAttachments, customValueWrites };
}

const source = makeIssue({
  id: "source",
  projectId: "proj-1",
  trackerId: "tracker-1",
  subject: "Original",
  description: "body",
  authorId: "original-author",
  doneRatio: 40,
});

const baseInput = {
  sourceIssueId: "source",
  targetProjectId: "proj-1",
  actingUserId: "user-1",
  sourceActor: copier,
  targetActor: copier,
  actorRoleIdsOnTarget: ["role-1"],
  copyAttachments: false,
  copySubtasks: false,
  copyWatchers: false,
  canSetPrivate: true,
  canManageSubtasks: true,
};

describe("copyIssue", () => {
  it("refuses a caller without copy_issues on the source project", async () => {
    const { repositories, created } = makeRepositories({ issues: [source] });

    await expect(copyIssue(repositories, { ...baseInput, sourceActor: viewer })).rejects.toThrow(CopyIssueNotPermittedError);
    expect(created).toEqual([]);
  });

  it("refuses a caller without add_issues on the target project", async () => {
    const { repositories, created } = makeRepositories({ issues: [source] });

    await expect(copyIssue(repositories, { ...baseInput, targetActor: viewer })).rejects.toThrow(CopyIssueNotPermittedError);
    expect(created).toEqual([]);
  });

  it("refuses to copy a private issue the actor cannot see", async () => {
    const hidden = makeIssue({ id: "source", projectId: "proj-1", trackerId: "tracker-1", isPrivate: true, authorId: "someone-else" });
    const restricted: AuthorizationActor = {
      kind: "member",
      roles: [{ builtin: 0, permissions: ["copy_issues", "add_issues"], issuesVisibility: "default", timeEntriesVisibility: "all" }],
    };
    const { repositories, created } = makeRepositories({ issues: [hidden] });

    await expect(copyIssue(repositories, { ...baseInput, sourceActor: restricted, targetActor: restricted })).rejects.toThrow(
      CopyIssueNotPermittedError,
    );
    expect(created).toEqual([]);
  });

  it("copies the attributes but re-authors the copy and resets its status to the tracker default", async () => {
    const { repositories, created } = makeRepositories({ issues: [source] });

    const result = await copyIssue(repositories, baseInput);

    expect(result.issue.subject).toBe("Original");
    expect(result.issue.description).toBe("body");
    expect(result.issue.doneRatio).toBe(40);
    // copy_from excludes author and status_id along with the ids and timestamps.
    expect(created[0].authorId).toBe("user-1");
    expect(created[0].statusId).toBe("new");
  });

  it("links the copy back to its source with a copied_to relation", async () => {
    const { repositories, relations } = makeRepositories({ issues: [source] });

    const result = await copyIssue(repositories, baseInput);

    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({ issueFromId: "source", issueToId: result.issue.id, relationType: "copied_to" });
  });

  it("skips the copied_to link across projects while cross-project relations are off", async () => {
    // next-pm defaults cross_project_issue_relations to off, and createIssueRelation
    // refuses the link; the copy itself must still succeed.
    const { repositories, relations, created } = makeRepositories({ issues: [source] });

    await copyIssue(repositories, { ...baseInput, targetProjectId: "proj-2" });

    expect(created).toHaveLength(1);
    expect(relations).toEqual([]);
  });

  it("drops an assignee who is not assignable in the target project", async () => {
    // "Clear the assignee if not available in the new project for new issues (eg. copy)".
    const assigned = makeIssue({ id: "source", projectId: "proj-1", trackerId: "tracker-1", assignedToId: "outsider", assignedToType: "user" });
    const { repositories, created } = makeRepositories({ issues: [assigned] });

    await copyIssue(repositories, baseInput);

    expect(created[0].assignedToId).toBeNull();
    expect(created[0].assignedToType).toBeNull();
  });

  it("keeps an assignee who is assignable in the target project", async () => {
    const assigned = makeIssue({ id: "source", projectId: "proj-1", trackerId: "tracker-1", assignedToId: "user-1", assignedToType: "user" });
    const { repositories, created } = makeRepositories({ issues: [assigned] });

    await copyIssue(repositories, baseInput);

    expect(created[0].assignedToId).toBe("user-1");
  });

  it("carries custom field values over to the copy", async () => {
    const { repositories, customValueWrites } = makeRepositories({
      issues: [source],
      customValues: [{ id: "cv-1", customFieldId: "cf-1", customizedType: "Issue", customizedId: "source", value: "kept" }],
    });

    const result = await copyIssue(repositories, baseInput);

    expect(customValueWrites).toContainEqual({ issueId: result.issue.id, fieldId: "cf-1", value: "kept" });
  });

  it("copies attachments under a fresh storage key only when asked", async () => {
    const attachment = { id: "a-1", storageKey: "original-key", filename: "f.txt", contentType: "text/plain", fileSize: 5, digest: "d", description: "" } as Attachment;
    const off = makeRepositories({ issues: [source], attachments: [attachment] });
    await copyIssue(off.repositories, baseInput);
    expect(off.savedAttachments).toEqual([]);

    const on = makeRepositories({ issues: [source], attachments: [attachment] });
    const result = await copyIssue(on.repositories, { ...baseInput, copyAttachments: true });
    expect(on.savedAttachments).toHaveLength(1);
    expect(on.savedAttachments[0].containerId).toBe(result.issue.id);
    // storage_key is UNIQUE, so the bytes are written again rather than the key reused.
    expect(on.savedAttachments[0].storageKey).not.toBe("original-key");
  });

  it("copies only active watchers, and only when asked", async () => {
    const users = [
      { id: "watcher-active", status: "active" as const },
      { id: "watcher-locked", status: "locked" as const },
      { id: "user-1", status: "active" as const },
    ];
    // The author's own auto-watch (issue_created) fires either way, so these assertions
    // look only at whether the *source's* watchers came across.
    const off = makeRepositories({ issues: [source], watcherUserIds: ["watcher-active"], users });
    await copyIssue(off.repositories, baseInput);
    expect(off.watched.map((entry) => entry.userId)).not.toContain("watcher-active");

    const on = makeRepositories({ issues: [source], watcherUserIds: ["watcher-active", "watcher-locked"], users });
    await copyIssue(on.repositories, { ...baseInput, copyWatchers: true });
    expect(on.watched.map((entry) => entry.userId)).toContain("watcher-active");
    expect(on.watched.map((entry) => entry.userId)).not.toContain("watcher-locked");
  });
});

describe("copyIssue — subtasks", () => {
  const parent = makeIssue({ id: "source", projectId: "proj-1", trackerId: "tracker-1", subject: "Parent" });
  const child = makeIssue({ id: "child", projectId: "proj-1", trackerId: "tracker-1", subject: "Child", parentId: "source" });
  const grandchild = makeIssue({ id: "grandchild", projectId: "proj-1", trackerId: "tracker-1", subject: "Grandchild", parentId: "child" });

  it("leaves the tree alone unless copySubtasks is set", async () => {
    const { repositories, created } = makeRepositories({ issues: [parent, child] });

    await copyIssue(repositories, baseInput);

    expect(created).toHaveLength(1);
  });

  it("copies the whole tree, re-pointing each copy at its copied parent", async () => {
    const { repositories, created } = makeRepositories({ issues: [parent, child, grandchild] });

    const result = await copyIssue(repositories, { ...baseInput, copySubtasks: true });

    expect(created).toHaveLength(3);
    const childCopy = created.find((issue) => issue.subject === "Child")!;
    const grandchildCopy = created.find((issue) => issue.subject === "Grandchild")!;
    expect(childCopy.parentId).toBe(result.issue.id);
    expect(grandchildCopy.parentId).toBe(childCopy.id);
  });

  it("skips a subtask the actor cannot see, and its descendants with it", async () => {
    // Redmine: "Do not copy subtasks that are not visible to avoid potential disclosure of
    // private data" — and a grandchild whose parent wasn't copied has nothing to attach to.
    const hiddenChild = makeIssue({
      id: "child",
      projectId: "proj-1",
      trackerId: "tracker-1",
      subject: "Child",
      parentId: "source",
      isPrivate: true,
      authorId: "someone-else",
    });
    const restricted: AuthorizationActor = {
      kind: "member",
      roles: [{ builtin: 0, permissions: ["copy_issues", "add_issues"], issuesVisibility: "default", timeEntriesVisibility: "all" }],
    };
    const { repositories, created } = makeRepositories({ issues: [parent, hiddenChild, grandchild] });

    await copyIssue(repositories, { ...baseInput, copySubtasks: true, sourceActor: restricted, targetActor: restricted });

    expect(created.map((issue) => issue.subject)).toEqual(["Parent"]);
  });

  it("drops a subtask's version when it is no longer open", async () => {
    const childWithVersion = makeIssue({
      id: "child",
      projectId: "proj-1",
      trackerId: "tracker-1",
      subject: "Child",
      parentId: "source",
      fixedVersionId: "version-closed",
    });
    const { repositories, created } = makeRepositories({
      issues: [parent, childWithVersion],
      versions: [{ id: "version-closed", status: "closed" } as Version],
    });

    await copyIssue(repositories, { ...baseInput, copySubtasks: true });

    expect(created.find((issue) => issue.subject === "Child")!.fixedVersionId).toBeNull();
  });
});
