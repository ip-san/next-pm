import { describe, expect, it, mock } from "bun:test";
import { logTime, InvalidTimeEntryError } from "./log-time";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { SettingsRepository } from "@/domain/settings/repository";

function makeRepo(settings: Record<string, string> = {}) {
  const timeEntryRepository: TimeEntryRepository = {
    listForProject: mock(async () => []),
    listForIssue: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (entry) => ({ ...entry, id: "entry-1", createdAt: new Date(), updatedAt: new Date() }) as TimeEntry),
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => {}),
  };
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => settings),
    setMany: mock(async () => {}),
  };
  return { timeEntryRepository, settingsRepository };
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
});
