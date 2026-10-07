import { describe, expect, it, mock } from "bun:test";
import { InvalidTimeEntryError, updateTimeEntry } from "./update-time-entry";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";

const existing: TimeEntry = {
  id: "entry-1",
  projectId: "proj-1",
  issueId: "issue-1",
  userId: "user-1",
  authorId: "user-1",
  activityId: "activity-1",
  hours: 2,
  comments: "",
  spentOn: "2026-07-31",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function issue(overrides: Partial<Issue> = {}): Issue {
  return { id: "issue-2", projectId: "proj-1", ...overrides } as Issue;
}

function makeRepos(options: { settings?: Record<string, string>; issue?: Issue | null } = {}) {
  const timeEntryRepository = {
    listForProject: mock(async () => []),
    listForIssue: mock(async () => []),
    findById: mock(async () => existing),
    create: mock(async () => existing),
    update: mock(async (id: string, changes) => ({ ...existing, ...changes, id })),
    delete: mock(async () => {}),
  } as unknown as TimeEntryRepository;
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => options.settings ?? {}),
    setMany: mock(async () => {}),
  };
  const issueRepository = {
    findById: mock(async () => (options.issue === undefined ? issue() : options.issue)),
  } as unknown as IssueRepository;
  return { timeEntryRepository, settingsRepository, issueRepository };
}

describe("updateTimeEntry", () => {
  it("persists only the fields that actually changed", async () => {
    const repos = makeRepos();
    await updateTimeEntry(repos, existing, { hours: 3, comments: "", spentOn: existing.spentOn });
    expect(repos.timeEntryRepository.update).toHaveBeenCalledWith("entry-1", {
      hours: 3,
      comments: "",
      spentOn: "2026-07-31",
    });
  });

  it("does not touch the repository when nothing is passed", async () => {
    const repos = makeRepos();
    const result = await updateTimeEntry(repos, existing, {});
    expect(result).toBe(existing);
    expect(repos.timeEntryRepository.update).not.toHaveBeenCalled();
  });

  it("rejects hours that a new entry would also be rejected for", async () => {
    const repos = makeRepos();
    await expect(updateTimeEntry(repos, existing, { hours: 0 })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.update).not.toHaveBeenCalled();
  });

  it("accepts 0 hours once timelog_accept_0_hours is on", async () => {
    const repos = makeRepos({ settings: { timelog_accept_0_hours: "1" } });
    const updated = await updateTimeEntry(repos, existing, { hours: 0 });
    expect(updated.hours).toBe(0);
  });

  it("allows detaching the entry from its issue", async () => {
    const repos = makeRepos();
    await updateTimeEntry(repos, existing, { issueId: null });
    expect(repos.timeEntryRepository.update).toHaveBeenCalledWith("entry-1", { issueId: null });
  });

  it("rejects moving the entry to an issue in another project", async () => {
    const repos = makeRepos({ issue: issue({ projectId: "other-project" }) });
    await expect(updateTimeEntry(repos, existing, { issueId: "issue-2" })).rejects.toThrow(InvalidTimeEntryError);
  });

  it("rejects moving the entry to an issue that doesn't exist", async () => {
    const repos = makeRepos({ issue: null });
    await expect(updateTimeEntry(repos, existing, { issueId: "issue-2" })).rejects.toThrow(InvalidTimeEntryError);
  });

  it("doesn't re-check the issue when the id is unchanged", async () => {
    const repos = makeRepos({ issue: null });
    await updateTimeEntry(repos, existing, { issueId: existing.issueId, hours: 4 });
    expect(repos.issueRepository.findById).not.toHaveBeenCalled();
  });
});
