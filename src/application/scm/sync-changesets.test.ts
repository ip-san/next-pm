import { describe, expect, it, mock } from "bun:test";
import { DEFAULT_KEYWORD_SCAN_OPTIONS, syncChangesets, type SyncChangesetsRepositories } from "./sync-changesets";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
import { StaleIssueError } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { Changeset, Commit, ScmRepository } from "@/domain/scm/entity";
import type { GitBrowser } from "@/domain/scm/git-browser";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function makeScmRepository(overrides: Partial<ScmRepository> = {}): ScmRepository {
  return { id: "repo-1", projectId: "proj-1", rootPath: "/repos/example", createdAt: new Date("2020-01-01"), ...overrides };
}

function makeCommit(overrides: Partial<Commit> = {}): Commit {
  return { hash: "h1", author: "Alice", authorEmail: "alice@example.com", date: "2024-06-01 10:00:00 +0000", message: "A commit", ...overrides };
}

function makeGitBrowser(commits: Commit[]): GitBrowser {
  return {
    listTree: mock(async () => []),
    readFile: mock(async () => ""),
    log: mock(async () => commits),
    diff: mock(async () => ""),
    blame: mock(async () => []),
  };
}

function makeChangesetRepository(): ChangesetRepository {
  const store = new Map<string, Changeset>();
  const links: Array<{ changesetId: string; issueId: string }> = [];
  let counter = 0;
  return {
    findByRevision: mock(async (scmRepositoryId, revision) => store.get(`${scmRepositoryId}:${revision}`) ?? null),
    create: mock(async (changeset) => {
      counter += 1;
      const row: Changeset = { ...changeset, id: `cs-${counter}`, createdAt: new Date() };
      store.set(`${changeset.scmRepositoryId}:${changeset.revision}`, row);
      return row;
    }),
    linkIssue: mock(async (changesetId, issueId) => {
      links.push({ changesetId, issueId });
    }),
    listForIssue: mock(async (issueId) =>
      links.filter((l) => l.issueId === issueId).map((l) => [...store.values()].find((c) => c.id === l.changesetId)!),
    ),
  };
}

function makeIssueStatusRepository(statuses: IssueStatus[]): IssueStatusRepository {
  return {
    findById: mock(async (id) => statuses.find((s) => s.id === id) ?? null),
    listAll: mock(async () => statuses),
    create: mock(async () => {
      throw new Error("not used");
    }),
  };
}

function makeTimeEntryRepository(): TimeEntryRepository {
  return {
    listForProject: mock(async () => []),
    listForIssue: mock(async () => []),
    create: mock(async (entry) => ({ ...entry, id: "te-1", createdAt: new Date() })),
  };
}

function makeEnumerationRepository(activities: Enumeration[]): EnumerationRepository {
  return {
    listByType: mock(async () => activities),
    create: mock(async () => {
      throw new Error("not used");
    }),
    unsetSystemDefaultsForType: mock(async () => {}),
  };
}

function makeUserRepository(user: User | null): UserRepository {
  return {
    listAll: mock(async () => (user ? [user] : [])),
    findByLogin: mock(async () => user),
    findById: mock(async () => user),
    findByIds: mock(async () => (user ? [user] : [])),
    findByApiKey: mock(async () => user),
    findByAtomKey: mock(async () => user),
    findByMail: mock(async () => user),
    create: mock(async (u) => ({ ...u, id: "generated" })),
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  };
}

const OPEN_STATUS: IssueStatus = { id: "status-open", name: "Open", description: "", isClosed: false, defaultDoneRatio: null, position: 1 };
const CLOSED_STATUS: IssueStatus = { id: "status-closed", name: "Closed", description: "", isClosed: true, defaultDoneRatio: 100, position: 2 };
const ACTIVITY: Enumeration = { id: "activity-1", type: "TimeEntryActivity", name: "Development", position: 1, isDefault: true, projectId: null, parentId: null };
const COMMITTER: User = {
  id: "user-1",
  login: "alice",
  mail: "alice@example.com",
  firstname: "Alice",
  lastname: "A",
  isAdmin: false,
  status: "active",
  passwordHash: "",
  passwordSalt: "",
  mustChangePassword: false,
  apiKey: null,
  atomKey: null,
  authSource: null,
  twofaScheme: null,
  twofaTotpKey: null,
  twofaTotpLastUsedStep: null,
};

describe("syncChangesets", () => {
  it("ingests a commit as a changeset, referencing an issue via a ref keyword", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: OPEN_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({ findByIdPrefix: mock(async () => [issue]) });
    const changesetRepository = makeChangesetRepository();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "refs #eb0b2d1a", date: "2024-06-01 10:00:00 +0000" })]),
      changesetRepository,
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result).toEqual({ ingested: 1, fixed: 0, timeLogged: 0 });
    expect(changesetRepository.linkIssue).toHaveBeenCalledWith("cs-1", issue.id);
    expect(issueRepository.update).not.toHaveBeenCalled();
  });

  it("closes the issue on a fix keyword and reports it in the result", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: OPEN_STATUS.id, lockVersion: 3 });
    const issueRepository = makeIssueRepositoryMock({
      findByIdPrefix: mock(async () => [issue]),
      update: mock(async (id, lockVersion, changes) => ({ ...issue, ...changes, lockVersion: lockVersion + 1 })),
    });
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "fixes #eb0b2d1a", date: "2024-06-01 10:00:00 +0000" })]),
      changesetRepository: makeChangesetRepository(),
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result).toEqual({ ingested: 1, fixed: 1, timeLogged: 0 });
    expect(issueRepository.update).toHaveBeenCalledWith(issue.id, 3, { statusId: CLOSED_STATUS.id, doneRatio: 100 });
  });

  it("does not re-close an already-closed issue", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: CLOSED_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({ findByIdPrefix: mock(async () => [issue]) });
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "fixes #eb0b2d1a", date: "2024-06-01 10:00:00 +0000" })]),
      changesetRepository: makeChangesetRepository(),
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result.fixed).toBe(0);
    expect(issueRepository.update).not.toHaveBeenCalled();
  });

  it("logs time against the committer when @Nh is present and the committer resolves by email", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: OPEN_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({ findByIdPrefix: mock(async () => [issue]) });
    const timeEntryRepository = makeTimeEntryRepository();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "refs #eb0b2d1a @2h", date: "2024-06-01 10:00:00 +0000" })]),
      changesetRepository: makeChangesetRepository(),
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository,
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result.timeLogged).toBe(1);
    expect(timeEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: issue.id, userId: COMMITTER.id, hours: 2 }),
    );
  });

  it("does not log time when the committer's email doesn't match any user", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: OPEN_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({ findByIdPrefix: mock(async () => [issue]) });
    const timeEntryRepository = makeTimeEntryRepository();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "refs #eb0b2d1a @2h", date: "2024-06-01 10:00:00 +0000" })]),
      changesetRepository: makeChangesetRepository(),
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository,
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(null),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result.timeLogged).toBe(0);
    expect(timeEntryRepository.create).not.toHaveBeenCalled();
  });

  it("does not fix or log time for commits committed before the repository was connected (historical import)", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: OPEN_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({ findByIdPrefix: mock(async () => [issue]) });
    const changesetRepository = makeChangesetRepository();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "fixes #eb0b2d1a @2h", date: "2019-01-01 10:00:00 +0000" })]),
      changesetRepository,
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository({ createdAt: new Date("2020-01-01") }), "HEAD", 50);
    expect(result).toEqual({ ingested: 1, fixed: 0, timeLogged: 0 });
    // Still linked for display purposes, even though no action fired.
    expect(changesetRepository.linkIssue).toHaveBeenCalledWith("cs-1", issue.id);
    expect(issueRepository.update).not.toHaveBeenCalled();
  });

  it("ignores an issue found in a different project than the repository", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "other-project", statusId: OPEN_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({ findByIdPrefix: mock(async () => [issue]) });
    const changesetRepository = makeChangesetRepository();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "fixes #eb0b2d1a", date: "2024-06-01 10:00:00 +0000" })]),
      changesetRepository,
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    await syncChangesets(repositories, makeScmRepository({ projectId: "proj-1" }), "HEAD", 50);
    expect(changesetRepository.linkIssue).not.toHaveBeenCalled();
  });

  it("does not re-ingest a commit whose revision is already stored (idempotent)", async () => {
    const changesetRepository = makeChangesetRepository();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ hash: "h1", message: "no refs here" })]),
      changesetRepository,
      issueRepository: makeIssueRepositoryMock(),
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const scmRepository = makeScmRepository();
    const first = await syncChangesets(repositories, scmRepository, "HEAD", 50);
    const second = await syncChangesets(repositories, scmRepository, "HEAD", 50);
    expect(first.ingested).toBe(1);
    expect(second.ingested).toBe(0);
  });

  it("skips a message with no matches without creating any issue link", async () => {
    const changesetRepository = makeChangesetRepository();
    const issueRepository = makeIssueRepositoryMock();
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "just a regular commit" })]),
      changesetRepository,
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result).toEqual({ ingested: 1, fixed: 0, timeLogged: 0 });
    expect(issueRepository.findByIdPrefix).not.toHaveBeenCalled();
    expect(changesetRepository.linkIssue).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent edit (StaleIssueError) without failing the whole sync", async () => {
    const issue = makeIssue({ id: "eb0b2d1a-0000-0000-0000-000000000000", projectId: "proj-1", statusId: OPEN_STATUS.id });
    const issueRepository = makeIssueRepositoryMock({
      findByIdPrefix: mock(async () => [issue]),
      update: mock(async () => {
        throw new StaleIssueError(issue.id);
      }),
    });
    const repositories: SyncChangesetsRepositories = {
      gitBrowser: makeGitBrowser([makeCommit({ message: "fixes #eb0b2d1a" })]),
      changesetRepository: makeChangesetRepository(),
      issueRepository,
      issueStatusRepository: makeIssueStatusRepository([OPEN_STATUS, CLOSED_STATUS]),
      timeEntryRepository: makeTimeEntryRepository(),
      enumerationRepository: makeEnumerationRepository([ACTIVITY]),
      userRepository: makeUserRepository(COMMITTER),
    };

    const result = await syncChangesets(repositories, makeScmRepository(), "HEAD", 50);
    expect(result).toEqual({ ingested: 1, fixed: 0, timeLogged: 0 });
  });

  it("uses the default keyword scan options unless overridden", () => {
    expect(DEFAULT_KEYWORD_SCAN_OPTIONS.refKeywords).toContain("refs");
    expect(DEFAULT_KEYWORD_SCAN_OPTIONS.fixKeywords).toContain("fixes");
  });
});
