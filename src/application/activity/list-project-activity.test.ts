import { describe, expect, it, mock } from "bun:test";
import { listProjectActivity, type ListProjectActivityRepositories } from "./list-project-activity";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import type { Journal } from "@/domain/journal/entity";
import type { Role } from "@/domain/role/entity";

const activeProject: ProjectAuthorizationContext = {
  isArchived: false,
  isActive: true,
  isPublic: true,
  enabledModules: ["issue_tracking", "wiki", "news", "boards", "documents", "time_tracking", "repository"],
};

const managerRole: Role = {
  id: "role-1",
  name: "Manager",
  builtin: 0,
  position: 1,
  permissions: ["view_issues", "view_wiki_pages", "view_news", "view_messages", "view_documents", "view_time_entries", "view_changesets"],
  issuesVisibility: "all",
  timeEntriesVisibility: "all",
  usersVisibility: "all",
  assignable: true,
};

const memberActor: AuthorizationActor = { kind: "member", roles: [managerRole] };

const from = new Date("2026-07-01T00:00:00Z");
const to = new Date("2026-08-01T00:00:00Z");
const inside = new Date("2026-07-15T00:00:00Z");
const outside = new Date("2026-06-01T00:00:00Z");

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "issue-1",
    projectId: "project-1",
    trackerId: "tracker-1",
    statusId: "status-1",
    priorityId: "priority-1",
    subject: "Fix login bug",
    description: "Users can't log in",
    authorId: "author-1",
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
    lockVersion: 0,
    createdAt: outside,
    updatedAt: outside,
    ...overrides,
  };
}

function timeEntry(overrides: Partial<import("@/domain/time-entry/entity").TimeEntry> = {}): import("@/domain/time-entry/entity").TimeEntry {
  return {
    id: "entry-1",
    projectId: "project-1",
    issueId: null,
    userId: "user-1",
    authorId: "user-1",
    activityId: "activity-1",
    hours: 2,
    comments: "Worked on it",
    spentOn: "2026-07-15",
    createdAt: inside,
    ...overrides,
  };
}

function changeset(overrides: Partial<import("@/domain/scm/entity").Changeset> = {}): import("@/domain/scm/entity").Changeset {
  return {
    id: "changeset-1",
    scmRepositoryId: "repo-1",
    revision: "abcdef1234567890",
    committerIdentity: "Alice <alice@example.com>",
    committedOn: inside,
    comments: "Fix login bug\n\nLonger body.",
    createdAt: inside,
    ...overrides,
  };
}

function journal(overrides: Partial<Journal>): Journal {
  return {
    id: "journal-1",
    journalizedType: "Issue",
    journalizedId: "issue-1",
    userId: "user-1",
    notes: "",
    details: [],
    createdAt: inside,
    ...overrides,
  };
}

function makeRepositories(overrides: Partial<ListProjectActivityRepositories> = {}): ListProjectActivityRepositories {
  return {
    issueRepository: { listByProject: mock(async () => []), findById: mock(async () => null) } as unknown as ListProjectActivityRepositories["issueRepository"],
    journalRepository: { listByProject: mock(async () => []) } as unknown as ListProjectActivityRepositories["journalRepository"],
    newsRepository: { listByProject: mock(async () => []) } as unknown as ListProjectActivityRepositories["newsRepository"],
    messageRepository: { listByProject: mock(async () => []) } as unknown as ListProjectActivityRepositories["messageRepository"],
    wikiContentRepository: { listByProject: mock(async () => []) } as unknown as ListProjectActivityRepositories["wikiContentRepository"],
    documentRepository: { listByProject: mock(async () => []) } as unknown as ListProjectActivityRepositories["documentRepository"],
    timeEntryRepository: { listForProject: mock(async () => []) } as unknown as ListProjectActivityRepositories["timeEntryRepository"],
    scmRepositoryRepository: { findByProject: mock(async () => null) } as unknown as ListProjectActivityRepositories["scmRepositoryRepository"],
    changesetRepository: { listByScmRepository: mock(async () => []) } as unknown as ListProjectActivityRepositories["changesetRepository"],
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof listProjectActivity>[1]> = {}) {
  return {
    projectId: "project-1",
    projectContext: activeProject,
    actor: memberActor,
    userId: "user-1",
    userGroupIds: [],
    issueVisibilityRoles: [managerRole],
    from,
    to,
    ...overrides,
  };
}

describe("listProjectActivity", () => {
  it("includes an issue created within the date range", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({ createdAt: inside })]) } as unknown as ListProjectActivityRepositories["issueRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([{ type: "issue_created", id: "issue-1", authorId: "author-1", title: "Fix login bug", excerpt: "Users can't log in", occurredAt: inside }]);
  });

  it("excludes an issue created outside the date range", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({ createdAt: outside })]) } as unknown as ListProjectActivityRepositories["issueRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([]);
  });

  it("excludes an issue outside the actor's private-issue visibility", async () => {
    const roleWithoutAllVisibility: Role = { ...managerRole, issuesVisibility: "own" };
    const repositories = makeRepositories({
      issueRepository: {
        listByProject: mock(async () => [issue({ createdAt: inside, isPrivate: true, authorId: "someone-else" })]),
      } as unknown as ListProjectActivityRepositories["issueRepository"],
    });
    const events = await listProjectActivity(
      repositories,
      baseInput({ actor: { kind: "member", roles: [roleWithoutAllVisibility] }, issueVisibilityRoles: [roleWithoutAllVisibility] }),
    );
    expect(events).toEqual([]);
  });

  it("includes a journal with notes as an issue_updated event", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({})]) } as unknown as ListProjectActivityRepositories["issueRepository"],
      journalRepository: {
        listByProject: mock(async () => [journal({ notes: "Reproduced on staging" })]),
      } as unknown as ListProjectActivityRepositories["journalRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([{ type: "issue_updated", id: "issue-1", authorId: "user-1", title: "Fix login bug", excerpt: "Reproduced on staging", occurredAt: inside }]);
  });

  it("includes a note-less journal that changed the status", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({})]) } as unknown as ListProjectActivityRepositories["issueRepository"],
      journalRepository: {
        listByProject: mock(async () => [journal({ notes: "", details: [{ property: "attr", fieldName: "statusId", oldValue: "open", newValue: "closed" }] })]),
      } as unknown as ListProjectActivityRepositories["journalRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("issue_updated");
  });

  it("drops a journal with no notes and no status change (e.g. custom-field-only edit)", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({})]) } as unknown as ListProjectActivityRepositories["issueRepository"],
      journalRepository: {
        listByProject: mock(async () => [journal({ notes: "", details: [{ property: "cf", fieldName: "custom-1", oldValue: "a", newValue: "b" }] })]),
      } as unknown as ListProjectActivityRepositories["journalRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([]);
  });

  it("drops a journal on an issue the actor can't see", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => []), findById: mock(async () => null) } as unknown as ListProjectActivityRepositories["issueRepository"],
      journalRepository: {
        listByProject: mock(async () => [journal({ notes: "Hidden update" })]),
      } as unknown as ListProjectActivityRepositories["journalRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([]);
  });

  it("skips a group the actor lacks permission for", async () => {
    const viewOnlyIssuesRole: Role = { ...managerRole, permissions: ["view_issues"] };
    const repositories = makeRepositories({
      newsRepository: {
        listByProject: mock(async () => [{ id: "n1", projectId: "project-1", authorId: "a", title: "Announcement", summary: "", description: "", createdAt: inside }]),
      } as unknown as ListProjectActivityRepositories["newsRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput({ actor: { kind: "member", roles: [viewOnlyIssuesRole] } }));
    expect(events).toEqual([]);
    expect(repositories.newsRepository.listByProject).not.toHaveBeenCalled();
  });

  it("restricts to the requested groups only", async () => {
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({ createdAt: inside })]) } as unknown as ListProjectActivityRepositories["issueRepository"],
      newsRepository: {
        listByProject: mock(async () => [{ id: "n1", projectId: "project-1", authorId: "a", title: "Announcement", summary: "", description: "", createdAt: inside }]),
      } as unknown as ListProjectActivityRepositories["newsRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput({ groups: ["news"] }));
    expect(events.map((e) => e.type)).toEqual(["news"]);
    expect(repositories.issueRepository.listByProject).not.toHaveBeenCalled();
  });

  it("sorts every group's events by occurredAt descending", async () => {
    const earlier = new Date("2026-07-05T00:00:00Z");
    const later = new Date("2026-07-20T00:00:00Z");
    const repositories = makeRepositories({
      issueRepository: { listByProject: mock(async () => [issue({ id: "a", createdAt: earlier })]) } as unknown as ListProjectActivityRepositories["issueRepository"],
      newsRepository: {
        listByProject: mock(async () => [{ id: "n1", projectId: "project-1", authorId: "a", title: "Announcement", summary: "", description: "", createdAt: later }]),
      } as unknown as ListProjectActivityRepositories["newsRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events.map((e) => e.type)).toEqual(["news", "issue_created"]);
  });

  it("includes a time entry with no linked issue", async () => {
    const repositories = makeRepositories({
      timeEntryRepository: { listForProject: mock(async () => [timeEntry({ issueId: null, createdAt: inside })]) } as unknown as ListProjectActivityRepositories["timeEntryRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([{ type: "time_entry", id: "entry-1", authorId: "user-1", title: "2h", excerpt: "Worked on it", occurredAt: inside }]);
  });

  it("includes a time entry linked to a visible issue", async () => {
    const repositories = makeRepositories({
      issueRepository: {
        listByProject: mock(async () => []),
        findById: mock(async () => issue({ id: "issue-1", isPrivate: false })),
      } as unknown as ListProjectActivityRepositories["issueRepository"],
      timeEntryRepository: { listForProject: mock(async () => [timeEntry({ issueId: "issue-1", createdAt: inside })]) } as unknown as ListProjectActivityRepositories["timeEntryRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("time_entry");
  });

  it("drops a time entry logged against a private issue the actor can't see (must not leak the issue's existence)", async () => {
    const roleWithoutAllVisibility: Role = { ...managerRole, issuesVisibility: "own" };
    const repositories = makeRepositories({
      issueRepository: {
        listByProject: mock(async () => []),
        findById: mock(async () => issue({ id: "issue-1", isPrivate: true, authorId: "someone-else" })),
      } as unknown as ListProjectActivityRepositories["issueRepository"],
      timeEntryRepository: { listForProject: mock(async () => [timeEntry({ issueId: "issue-1", createdAt: inside })]) } as unknown as ListProjectActivityRepositories["timeEntryRepository"],
    });
    const events = await listProjectActivity(
      repositories,
      baseInput({ actor: { kind: "member", roles: [roleWithoutAllVisibility] }, issueVisibilityRoles: [roleWithoutAllVisibility] }),
    );
    expect(events).toEqual([]);
  });

  it("includes a changeset within the date range, using its first comment line as the title", async () => {
    const repositories = makeRepositories({
      scmRepositoryRepository: { findByProject: mock(async () => ({ id: "repo-1", projectId: "project-1", rootPath: "/repos/x", createdAt: outside })) } as unknown as ListProjectActivityRepositories["scmRepositoryRepository"],
      changesetRepository: { listByScmRepository: mock(async () => [changeset({ createdAt: inside })]) } as unknown as ListProjectActivityRepositories["changesetRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([
      {
        type: "changeset",
        id: "abcdef1234567890",
        authorId: null,
        title: "Fix login bug",
        excerpt: "Alice <alice@example.com> — abcdef12",
        occurredAt: inside,
      },
    ]);
  });

  it("returns no changeset events when the project has no connected repository", async () => {
    const repositories = makeRepositories({
      changesetRepository: { listByScmRepository: mock(async () => [changeset({ createdAt: inside })]) } as unknown as ListProjectActivityRepositories["changesetRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput());
    expect(events).toEqual([]);
    expect(repositories.changesetRepository.listByScmRepository).not.toHaveBeenCalled();
  });

  it("skips the changeset group when the actor lacks view_changesets", async () => {
    const noRepositoryRole: Role = { ...managerRole, permissions: managerRole.permissions.filter((p) => p !== "view_changesets") };
    const repositories = makeRepositories({
      scmRepositoryRepository: { findByProject: mock(async () => ({ id: "repo-1", projectId: "project-1", rootPath: "/repos/x", createdAt: outside })) } as unknown as ListProjectActivityRepositories["scmRepositoryRepository"],
      changesetRepository: { listByScmRepository: mock(async () => [changeset({ createdAt: inside })]) } as unknown as ListProjectActivityRepositories["changesetRepository"],
    });
    const events = await listProjectActivity(repositories, baseInput({ actor: { kind: "member", roles: [noRepositoryRole] } }));
    expect(events).toEqual([]);
    expect(repositories.scmRepositoryRepository.findByProject).not.toHaveBeenCalled();
  });
});
