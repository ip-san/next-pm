import { describe, expect, it, mock } from "bun:test";
import { logTime, InvalidTimeEntryError } from "./log-time";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";

function makeRepo(): TimeEntryRepository {
  return {
    listForProject: mock(async () => []),
    listForIssue: mock(async () => []),
    create: mock(async (entry) => ({ ...entry, id: "entry-1", createdAt: new Date() }) as TimeEntry),
  };
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
    const timeEntryRepository = makeRepo();
    const entry = await logTime({ timeEntryRepository }, { ...baseInput, hours: 2.5 });
    expect(entry.hours).toBe(2.5);
  });

  it("rejects zero hours", async () => {
    const timeEntryRepository = makeRepo();
    await expect(logTime({ timeEntryRepository }, { ...baseInput, hours: 0 })).rejects.toThrow(InvalidTimeEntryError);
    expect(timeEntryRepository.create).not.toHaveBeenCalled();
  });

  it("rejects negative hours", async () => {
    const timeEntryRepository = makeRepo();
    await expect(logTime({ timeEntryRepository }, { ...baseInput, hours: -1 })).rejects.toThrow(InvalidTimeEntryError);
  });

  it("rejects non-finite hours", async () => {
    const timeEntryRepository = makeRepo();
    await expect(logTime({ timeEntryRepository }, { ...baseInput, hours: NaN })).rejects.toThrow(InvalidTimeEntryError);
  });
});
