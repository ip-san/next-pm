import { describe, expect, it, mock } from "bun:test";
import { InvalidChangesetIssueLinkError, linkChangesetIssue, type LinkChangesetIssueRepositories } from "./link-changeset-issue";
import { unlinkChangesetIssue } from "./unlink-changeset-issue";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { Changeset, Commit, ScmRepository } from "@/domain/scm/entity";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import type { UserRepository } from "@/domain/user/repository";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "Proj",
    identifier: "proj-1",
    description: "",
    isPublic: true,
    status: "active",
    parentId: null,
    lft: 1,
    rgt: 8,
    position: 1,
    enabledModules: ["issue_tracking", "repository"],
    trackerIds: [],
    ...overrides,
  };
}

const REPOSITORY_PROJECT = makeProject({ id: "proj-1", lft: 2, rgt: 5 });
const ANCESTOR_PROJECT = makeProject({ id: "proj-root", lft: 1, rgt: 8 });
const SIBLING_PROJECT = makeProject({ id: "proj-sibling", lft: 6, rgt: 7 });

const SCM_REPOSITORY: ScmRepository = {
  id: "repo-1",
  projectId: "proj-1",
  identifier: "",
  isDefault: true,
  vendor: "git",
  rootPath: "/repos/example",
  createdAt: new Date("2020-01-01"),
};

const COMMIT: Commit = {
  hash: "abcdef1234567890",
  author: "Alice",
  authorEmail: "alice@example.com",
  date: "2024-06-01 10:00:00 +0000",
  message: "Some commit",
};

function makeChangesetRepository(stored: Changeset[] = [], links: Array<{ changesetId: string; issueId: string }> = []) {
  const rows = [...stored];
  return {
    findByRevision: mock(async (scmRepositoryId: string, revision: string) =>
      rows.find((row) => row.scmRepositoryId === scmRepositoryId && row.revision === revision) ?? null,
    ),
    create: mock(async (changeset: Omit<Changeset, "id" | "createdAt">) => {
      const row: Changeset = { ...changeset, id: "cs-new", createdAt: new Date() };
      rows.push(row);
      return row;
    }),
    linkIssue: mock(async (changesetId: string, issueId: string) => {
      links.push({ changesetId, issueId });
    }),
    unlinkIssue: mock(async (changesetId: string, issueId: string) => {
      const at = links.findIndex((l) => l.changesetId === changesetId && l.issueId === issueId);
      if (at >= 0) links.splice(at, 1);
    }),
    listIssueIds: mock(async (changesetId: string) => links.filter((l) => l.changesetId === changesetId).map((l) => l.issueId)),
    findLatestByCommitter: mock(async () => null),
  } as unknown as ChangesetRepository;
}

function makeRepositories(options: {
  issues: Issue[];
  projects?: Project[];
  changesetRepository?: ChangesetRepository;
}): LinkChangesetIssueRepositories {
  const projects = options.projects ?? [REPOSITORY_PROJECT, ANCESTOR_PROJECT, SIBLING_PROJECT];
  return {
    scmBrowser: { log: mock(async () => [COMMIT]) } as unknown as ScmBrowser,
    changesetRepository: options.changesetRepository ?? makeChangesetRepository(),
    issueRepository: makeIssueRepositoryMock({
      findByIdPrefix: mock(async (prefix: string) => options.issues.filter((issue) => issue.id.startsWith(prefix))),
      findById: mock(async (id: string) => options.issues.find((issue) => issue.id === id) ?? null),
    }),
    projectRepository: { findById: mock(async (id: string) => projects.find((p) => p.id === id) ?? null) } as unknown as ProjectRepository,
    userRepository: { findByLogin: mock(async () => null), findByMail: mock(async () => null) } as unknown as UserRepository,
  };
}

const VIEWER = { canViewIssue: () => true };

function baseInput(issueRef: string, crossProjectRef = false) {
  return { scmRepository: SCM_REPOSITORY, repositoryProject: REPOSITORY_PROJECT, revision: "abcdef12", issueRef, crossProjectRef, ...VIEWER };
}

describe("linkChangesetIssue", () => {
  it("links an issue in the repository's own project, creating the changeset row on demand", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const changesetRepository = makeChangesetRepository();
    const repositories = makeRepositories({ issues: [issue], changesetRepository });

    const result = await linkChangesetIssue(repositories, baseInput("eb0b2d1a"));

    expect(result.issue.id).toBe(issue.id);
    // Keyed on the full revision the SCM reported, not the abbreviated one the user clicked.
    expect(changesetRepository.create).toHaveBeenCalledWith(expect.objectContaining({ revision: COMMIT.hash }));
    expect(changesetRepository.linkIssue).toHaveBeenCalledWith("cs-new", issue.id);
  });

  it("accepts the reference with a leading #", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const repositories = makeRepositories({ issues: [issue] });
    await expect(linkChangesetIssue(repositories, baseInput("#eb0b2d1a"))).resolves.toBeTruthy();
  });

  it("reuses an already-stored changeset instead of creating a second one", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const existing: Changeset = {
      id: "cs-1",
      scmRepositoryId: "repo-1",
      revision: "abcdef12",
      committerIdentity: "Alice <alice@example.com>",
      userId: null,
      committedOn: new Date("2024-06-01"),
      comments: "",
      createdAt: new Date("2024-06-01"),
    };
    const changesetRepository = makeChangesetRepository([existing]);
    const repositories = makeRepositories({ issues: [issue], changesetRepository });

    await linkChangesetIssue(repositories, baseInput("eb0b2d1a"));
    expect(changesetRepository.create).not.toHaveBeenCalled();
    expect(changesetRepository.linkIssue).toHaveBeenCalledWith("cs-1", issue.id);
  });

  it("links an issue in an ancestor project even with cross-project references off", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-root" });
    const repositories = makeRepositories({ issues: [issue] });
    await expect(linkChangesetIssue(repositories, baseInput("eb0b2d1a"))).resolves.toBeTruthy();
  });

  it("refuses an issue in a sibling project until cross-project references are on", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-sibling" });
    await expect(linkChangesetIssue(makeRepositories({ issues: [issue] }), baseInput("eb0b2d1a"))).rejects.toThrow(
      InvalidChangesetIssueLinkError,
    );
    await expect(linkChangesetIssue(makeRepositories({ issues: [issue] }), baseInput("eb0b2d1a", true))).resolves.toBeTruthy();
  });

  it("refuses an issue the viewer cannot see", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", isPrivate: true, authorId: "someone-else" });
    const repositories = makeRepositories({ issues: [issue] });
    await expect(linkChangesetIssue(repositories, { ...baseInput("eb0b2d1a"), canViewIssue: () => false })).rejects.toThrow(
      InvalidChangesetIssueLinkError,
    );
  });

  it("refuses an ambiguous id prefix rather than picking one", async () => {
    const issues = [
      makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" }),
      makeIssue({ id: "eb0b2d1a-1111-0000-0000-000000000000", projectId: "proj-1" }),
    ];
    await expect(linkChangesetIssue(makeRepositories({ issues }), baseInput("eb0b2d1a"))).rejects.toThrow(InvalidChangesetIssueLinkError);
  });

  it("refuses an issue that is already linked", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const links = [{ changesetId: "cs-new", issueId: issue.id }];
    const changesetRepository = makeChangesetRepository([], links);
    const repositories = makeRepositories({ issues: [issue], changesetRepository });
    await expect(linkChangesetIssue(repositories, baseInput("eb0b2d1a"))).rejects.toThrow(InvalidChangesetIssueLinkError);
  });

  it("refuses a revision the SCM doesn't know", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const repositories = { ...makeRepositories({ issues: [issue] }), scmBrowser: { log: mock(async () => []) } as unknown as ScmBrowser };
    await expect(linkChangesetIssue(repositories, baseInput("eb0b2d1a"))).rejects.toThrow(InvalidChangesetIssueLinkError);
  });
});

describe("unlinkChangesetIssue", () => {
  const existing: Changeset = {
    id: "cs-1",
    scmRepositoryId: "repo-1",
    revision: "abcdef12",
    committerIdentity: "Alice <alice@example.com>",
    userId: null,
    committedOn: new Date("2024-06-01"),
    comments: "",
    createdAt: new Date("2024-06-01"),
  };

  it("removes the link", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const links = [{ changesetId: "cs-1", issueId: issue.id }];
    const changesetRepository = makeChangesetRepository([existing], links);
    const issueRepository = makeIssueRepositoryMock({ findById: mock(async () => issue) });

    await unlinkChangesetIssue(
      { changesetRepository, issueRepository },
      { scmRepository: SCM_REPOSITORY, revision: "abcdef12", issueId: issue.id, ...VIEWER },
    );
    expect(changesetRepository.unlinkIssue).toHaveBeenCalledWith("cs-1", issue.id);
  });

  // Redmine's remove_related_issue reports success either way; nothing is created on demand here.
  it("does nothing when the revision has no stored changeset", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1" });
    const changesetRepository = makeChangesetRepository();
    const issueRepository = makeIssueRepositoryMock({ findById: mock(async () => issue) });

    await unlinkChangesetIssue(
      { changesetRepository, issueRepository },
      { scmRepository: SCM_REPOSITORY, revision: "abcdef12", issueId: issue.id, ...VIEWER },
    );
    expect(changesetRepository.unlinkIssue).not.toHaveBeenCalled();
  });

  it("does nothing for an issue the viewer cannot see", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", isPrivate: true, authorId: "someone-else" });
    const changesetRepository = makeChangesetRepository([existing], [{ changesetId: "cs-1", issueId: issue.id }]);
    const issueRepository = makeIssueRepositoryMock({ findById: mock(async () => issue) });

    await unlinkChangesetIssue(
      { changesetRepository, issueRepository },
      {
        scmRepository: SCM_REPOSITORY,
        revision: "abcdef12",
        issueId: issue.id,
        canViewIssue: () => false,
      },
    );
    expect(changesetRepository.unlinkIssue).not.toHaveBeenCalled();
  });
});
