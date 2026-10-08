import { describe, expect, it, mock } from "bun:test";
import { InvalidTimeEntryError, updateTimeEntry } from "./update-time-entry";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
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

/** A fresh stub per call — tests reassign listOverridesForProject, so it must not be shared. */
const noProjectOverrides = (): ProjectActivityRepository => ({
  listOverridesForProject: async () => [],
  createOverride: async () => {
    throw new Error("not used");
  },
  updateOverride: async () => {},
  deleteOverride: async () => {},
  reassignTimeEntries: async () => {},
});

const activity = (overrides: Partial<Enumeration> = {}): Enumeration => ({
  id: "activity-1",
  type: "TimeEntryActivity",
  name: "Development",
  position: 1,
  isDefault: true,
  active: true,
  projectId: null,
  parentId: null,
  ...overrides,
});

const issue = (overrides: Partial<Issue> = {}): Issue => ({ id: "issue-2", projectId: "proj-1", ...overrides }) as Issue;

function makeRepos(
  options: { settings?: Record<string, string>; activities?: Enumeration[]; issue?: Issue | null } = {},
) {
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
  const enumerationRepository: EnumerationRepository = {
    listByType: mock(async () => options.activities ?? [activity(), activity({ id: "activity-2", name: "Design" })]),
    create: mock(async () => {
      throw new Error("not used");
    }),
    unsetSystemDefaultsForType: mock(async () => {}),
  };
  const issueRepository = {
    findById: mock(async () => (options.issue === undefined ? issue() : options.issue)),
  } as unknown as IssueRepository;
  return { timeEntryRepository, settingsRepository, enumerationRepository, issueRepository, projectActivityRepository: noProjectOverrides() };
}

describe("updateTimeEntry", () => {
  it("persists only the fields that actually changed", async () => {
    const repos = makeRepos();
    await updateTimeEntry(repos, existing, { hours: 3, comments: "", spentOn: existing.spentOn });
    expect(repos.timeEntryRepository.update).toHaveBeenCalledWith("entry-1", { hours: 3 });
  });

  it("does not touch the repository when nothing is passed", async () => {
    const repos = makeRepos();
    const result = await updateTimeEntry(repos, existing, {});
    expect(result).toBe(existing);
    expect(repos.timeEntryRepository.update).not.toHaveBeenCalled();
  });

  it("does not touch the repository when every field is resubmitted unchanged", async () => {
    const repos = makeRepos();
    const result = await updateTimeEntry(repos, existing, {
      issueId: existing.issueId,
      userId: existing.userId,
      activityId: existing.activityId,
      hours: existing.hours,
      comments: existing.comments,
      spentOn: existing.spentOn,
    });
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

  it("rejects an activity belonging to another project, which is absent from this one's set", async () => {
    // listByType returns system rows only, so another project's override can only ever
    // reach this check as an id that is not in *this* project's effective list.
    const repos = makeRepos({ activities: [activity()] });
    await expect(updateTimeEntry(repos, existing, { activityId: "activity-2" })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.update).not.toHaveBeenCalled();
  });

  it("rejects moving an entry onto an activity this project has switched off", async () => {
    const repos = makeRepos({ activities: [activity(), activity({ id: "activity-2", isDefault: false })] });
    repos.projectActivityRepository.listOverridesForProject = mock(async () => [
      activity({ id: "override-2", projectId: "proj-1", parentId: "activity-2", active: false }),
    ]);
    await expect(updateTimeEntry(repos, existing, { activityId: "activity-2" })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.update).not.toHaveBeenCalled();
  });

  it("rejects an activity id that is not a TimeEntryActivity", async () => {
    const repos = makeRepos({ activities: [activity()] });
    await expect(updateTimeEntry(repos, existing, { activityId: "some-issue-priority" })).rejects.toThrow(
      InvalidTimeEntryError,
    );
  });

  it("accepts a different activity that is available to the project", async () => {
    const repos = makeRepos();
    const updated = await updateTimeEntry(repos, existing, { activityId: "activity-2" });
    expect(updated.activityId).toBe("activity-2");
  });

  it("rejects moving the entry to an issue in another project", async () => {
    const repos = makeRepos({ issue: issue({ projectId: "other-project" }) });
    await expect(updateTimeEntry(repos, existing, { issueId: "issue-2" })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.update).not.toHaveBeenCalled();
  });

  it("rejects moving the entry to an issue that doesn't exist", async () => {
    const repos = makeRepos({ issue: null });
    await expect(updateTimeEntry(repos, existing, { issueId: "issue-2" })).rejects.toThrow(InvalidTimeEntryError);
  });

  it("accepts moving the entry to another issue in the same project", async () => {
    const repos = makeRepos();
    const updated = await updateTimeEntry(repos, existing, { issueId: "issue-2" });
    expect(updated.issueId).toBe("issue-2");
  });

  it("doesn't re-check the issue when the id is unchanged", async () => {
    const repos = makeRepos({ issue: null });
    await updateTimeEntry(repos, existing, { issueId: existing.issueId, hours: 4 });
    expect(repos.issueRepository.findById).not.toHaveBeenCalled();
  });
});
