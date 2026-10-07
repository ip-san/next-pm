import { describe, expect, it, mock } from "bun:test";
import { deleteTracker, TrackerNotDeletableError } from "./delete-tracker";
import type { TrackerAdminRepository } from "@/domain/tracker/repository";

function makeRepo(issueCount: number): TrackerAdminRepository {
  return {
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => {}),
    countIssuesUsing: mock(async () => issueCount),
    updatePositions: mock(async () => {}),
  };
}

describe("deleteTracker", () => {
  it("deletes a tracker with no issues", async () => {
    const trackerAdminRepository = makeRepo(0);
    await deleteTracker({ trackerAdminRepository }, "tracker-1");
    expect(trackerAdminRepository.delete).toHaveBeenCalledWith("tracker-1");
  });

  it("refuses a tracker that still has issues", async () => {
    const trackerAdminRepository = makeRepo(1);
    await expect(deleteTracker({ trackerAdminRepository }, "tracker-1")).rejects.toThrow(TrackerNotDeletableError);
    expect(trackerAdminRepository.delete).not.toHaveBeenCalled();
  });
});
