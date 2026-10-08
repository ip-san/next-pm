import { describe, expect, it, mock } from "bun:test";
import { logTime, InvalidTimeEntryError } from "./log-time";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";
import type { EnumerationRepository } from "@/domain/enumeration/repository";

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
  active: true,
  position: 1,
  isDefault: true,
  projectId: null,
  parentId: null,
  ...overrides,
});

function makeRepo(settings: Record<string, string> = {}, activities: Enumeration[] = [activity()]) {
  const timeEntryRepository: TimeEntryRepository = {
    listForProject: mock(async () => []),
    listForIssue: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (entry) => ({ ...entry, id: "entry-1", createdAt: new Date(), updatedAt: new Date() }) as TimeEntry),
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => {}),
    reassignProjectForIssues: mock(async () => undefined),
    listForIssues: mock(async () => []),
    deleteForIssues: mock(async () => undefined),
    detachFromIssues: mock(async () => undefined),
    reassignToIssue: mock(async () => undefined),
  };
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => settings),
    setMany: mock(async () => {}),
  };
  const enumerationRepository: EnumerationRepository = {
    listByType: mock(async () => activities),
    create: mock(async () => {
      throw new Error("not used");
    }),
    unsetSystemDefaultsForType: mock(async () => {}),
  };
  return { timeEntryRepository, settingsRepository, enumerationRepository, projectActivityRepository: noProjectOverrides() };
}

const baseInput = {
  projectId: "proj-1",
  issueId: "issue-1",
  userId: "user-1",
  authorId: "user-1",
  activityId: "activity-1",
  comments: "",
  spentOn: "2026-07-31",
};

describe("logTime", () => {
  it("persists a valid positive-hours entry", async () => {
    const repos = makeRepo();
    const entry = await logTime(repos, { ...baseInput, hours: 2.5 });
    expect(entry.hours).toBe(2.5);
  });

  it("rejects zero hours by default (timelog_accept_0_hours unset)", async () => {
    const repos = makeRepo();
    await expect(logTime(repos, { ...baseInput, hours: 0 })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.create).not.toHaveBeenCalled();
  });

  it("accepts zero hours when timelog_accept_0_hours=1", async () => {
    const repos = makeRepo({ timelog_accept_0_hours: "1" });
    const entry = await logTime(repos, { ...baseInput, hours: 0 });
    expect(entry.hours).toBe(0);
  });

  it("rejects negative hours even when timelog_accept_0_hours=1", async () => {
    const repos = makeRepo({ timelog_accept_0_hours: "1" });
    await expect(logTime(repos, { ...baseInput, hours: -1 })).rejects.toThrow(InvalidTimeEntryError);
  });

  it("rejects non-finite hours", async () => {
    const repos = makeRepo();
    await expect(logTime(repos, { ...baseInput, hours: NaN })).rejects.toThrow(InvalidTimeEntryError);
  });

  it("rejects an activity id that is not a TimeEntryActivity at all", async () => {
    const repos = makeRepo({}, []);
    await expect(logTime(repos, { ...baseInput, hours: 1 })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.create).not.toHaveBeenCalled();
  });

  it("rejects an activity belonging to another project, which is simply absent from this one's set", async () => {
    // listByType returns system rows only, so another project's override can only ever
    // reach this check as an id that is not in *this* project's effective list.
    const repos = makeRepo({}, [activity({ id: "activity-2" })]);
    await expect(logTime(repos, { ...baseInput, hours: 1 })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.create).not.toHaveBeenCalled();
  });

  it("rejects an activity this project has switched off", async () => {
    const repos = makeRepo({}, [activity()]);
    repos.projectActivityRepository.listOverridesForProject = mock(async () => [
      activity({ id: "override-1", projectId: "proj-1", parentId: "activity-1", active: false }),
    ]);
    await expect(logTime(repos, { ...baseInput, hours: 1 })).rejects.toThrow(InvalidTimeEntryError);
    expect(repos.timeEntryRepository.create).not.toHaveBeenCalled();
  });

  it("accepts the project's own override of a system activity", async () => {
    const repos = makeRepo({}, [activity()]);
    repos.projectActivityRepository.listOverridesForProject = mock(async () => [
      activity({ id: "override-1", projectId: "proj-1", parentId: "activity-1" }),
    ]);
    const entry = await logTime(repos, { ...baseInput, hours: 1, activityId: "override-1" });
    expect(entry.activityId).toBe("override-1");
  });

  it("accepts a system activity the project has not overridden", async () => {
    const repos = makeRepo({}, [activity()]);
    const entry = await logTime(repos, { ...baseInput, hours: 1 });
    expect(entry.activityId).toBe("activity-1");
  });
});
