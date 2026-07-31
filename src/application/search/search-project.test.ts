import { describe, expect, it, mock } from "bun:test";
import { searchProject, type SearchProjectRepositories } from "./search-project";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import type { Role } from "@/domain/role/entity";

const activeProject: ProjectAuthorizationContext = { isArchived: false, isActive: true, isPublic: true, enabledModules: ["issue_tracking", "wiki", "news", "boards"] };

const managerRole: Role = {
  id: "role-1",
  name: "Manager",
  builtin: 0,
  position: 1,
  permissions: ["view_issues", "view_wiki_pages", "view_news", "view_messages"],
  issuesVisibility: "all",
  timeEntriesVisibility: "all",
  usersVisibility: "all",
  assignable: true,
};

const memberActor: AuthorizationActor = { kind: "member", roles: [managerRole] };

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "issue-1",
    projectId: "project-1",
    trackerId: "tracker-1",
    statusId: "status-1",
    priorityId: "priority-1",
    subject: "Matching issue",
    description: "",
    authorId: "author-1",
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

function makeRepositories(overrides: Partial<SearchProjectRepositories> = {}): SearchProjectRepositories {
  return {
    issueRepository: { search: mock(async () => []) } as unknown as SearchProjectRepositories["issueRepository"],
    wikiContentRepository: { search: mock(async () => []) } as unknown as SearchProjectRepositories["wikiContentRepository"],
    newsRepository: { search: mock(async () => []) } as unknown as SearchProjectRepositories["newsRepository"],
    messageRepository: { search: mock(async () => []) } as unknown as SearchProjectRepositories["messageRepository"],
    ...overrides,
  };
}

describe("searchProject", () => {
  it("returns an empty array for a blank query without calling any repository", async () => {
    const repositories = makeRepositories();
    const results = await searchProject(repositories, {
      projectId: "project-1",
      projectContext: activeProject,
      actor: memberActor,
      userId: "user-1",
      issueVisibilityRoles: [managerRole],
      query: "   ",
    });
    expect(results).toEqual([]);
    expect(repositories.issueRepository.search).not.toHaveBeenCalled();
  });

  it("includes matching issues visible to the actor", async () => {
    const repositories = makeRepositories({
      issueRepository: { search: mock(async () => [issue({ id: "a", subject: "Fix bug" })]) } as unknown as SearchProjectRepositories["issueRepository"],
    });
    const results = await searchProject(repositories, {
      projectId: "project-1",
      projectContext: activeProject,
      actor: memberActor,
      userId: "user-1",
      issueVisibilityRoles: [managerRole],
      query: "bug",
    });
    expect(results).toEqual([{ type: "issue", id: "a", title: "Fix bug", excerpt: "" }]);
  });

  it("excludes a private issue outside the actor's visibility", async () => {
    const repositories = makeRepositories({
      issueRepository: {
        search: mock(async () => [issue({ id: "a", isPrivate: true, authorId: "someone-else" })]),
      } as unknown as SearchProjectRepositories["issueRepository"],
    });
    const roleWithoutAllVisibility: Role = { ...managerRole, issuesVisibility: "own" };
    const results = await searchProject(repositories, {
      projectId: "project-1",
      projectContext: activeProject,
      actor: { kind: "member", roles: [roleWithoutAllVisibility] },
      userId: "user-1",
      issueVisibilityRoles: [roleWithoutAllVisibility],
      query: "bug",
    });
    expect(results).toEqual([]);
  });

  it("skips a search type the actor lacks permission for", async () => {
    const viewOnlyIssuesRole: Role = { ...managerRole, permissions: ["view_issues"] };
    const repositories = makeRepositories({
      newsRepository: { search: mock(async () => [{ id: "n1", projectId: "project-1", authorId: "a", title: "Announcement", summary: "", description: "", createdAt: new Date() }]) } as unknown as SearchProjectRepositories["newsRepository"],
    });
    const results = await searchProject(repositories, {
      projectId: "project-1",
      projectContext: activeProject,
      actor: { kind: "member", roles: [viewOnlyIssuesRole] },
      userId: "user-1",
      issueVisibilityRoles: [viewOnlyIssuesRole],
      query: "announcement",
    });
    expect(results).toEqual([]);
    expect(repositories.newsRepository.search).not.toHaveBeenCalled();
  });

  it("aggregates results across every permitted type", async () => {
    const repositories = makeRepositories({
      issueRepository: { search: mock(async () => [issue({ id: "a" })]) } as unknown as SearchProjectRepositories["issueRepository"],
      newsRepository: {
        search: mock(async () => [{ id: "n1", projectId: "project-1", authorId: "a", title: "News", summary: "", description: "desc", createdAt: new Date() }]),
      } as unknown as SearchProjectRepositories["newsRepository"],
    });
    const results = await searchProject(repositories, {
      projectId: "project-1",
      projectContext: activeProject,
      actor: memberActor,
      userId: "user-1",
      issueVisibilityRoles: [managerRole],
      query: "x",
    });
    expect(results.map((r) => r.type).sort()).toEqual(["issue", "news"]);
  });
});
