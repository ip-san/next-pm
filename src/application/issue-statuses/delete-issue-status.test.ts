import { describe, expect, it, mock } from "bun:test";
import { deleteIssueStatus, IssueStatusNotDeletableError } from "./delete-issue-status";
import type { IssueStatusAdminRepository } from "@/domain/issue-status/repository";

function makeRepo(issueCount: number, trackerCount: number): IssueStatusAdminRepository {
  return {
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => {}),
    countIssuesUsing: mock(async () => issueCount),
    countTrackersDefaultingTo: mock(async () => trackerCount),
    updatePositions: mock(async () => {}),
  };
}

describe("deleteIssueStatus", () => {
  it("deletes an unused status", async () => {
    const issueStatusRepository = makeRepo(0, 0);
    await deleteIssueStatus({ issueStatusRepository }, "status-1");
    expect(issueStatusRepository.delete).toHaveBeenCalledWith("status-1");
  });

  it("refuses a status still carried by issues", async () => {
    const issueStatusRepository = makeRepo(2, 0);
    await expect(deleteIssueStatus({ issueStatusRepository }, "status-1")).rejects.toThrow(IssueStatusNotDeletableError);
    expect(issueStatusRepository.delete).not.toHaveBeenCalled();
  });

  it("refuses a status that is a tracker's default", async () => {
    const issueStatusRepository = makeRepo(0, 1);
    await expect(deleteIssueStatus({ issueStatusRepository }, "status-1")).rejects.toThrow(IssueStatusNotDeletableError);
    expect(issueStatusRepository.delete).not.toHaveBeenCalled();
  });
});
