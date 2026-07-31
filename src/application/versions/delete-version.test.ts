import { describe, expect, it, mock } from "bun:test";
import { deleteVersion, VersionNotDeletableError } from "./delete-version";
import type { VersionRepository } from "@/domain/version/repository";

function makeRepo(fixedIssueCount: number): VersionRepository {
  return {
    listByProject: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async () => {
      throw new Error("not implemented");
    }),
    update: mock(async () => {
      throw new Error("not implemented");
    }),
    delete: mock(async () => {}),
    countFixedIssues: mock(async () => fixedIssueCount),
  };
}

describe("deleteVersion", () => {
  it("deletes a version with no fixed issues", async () => {
    const versionRepository = makeRepo(0);
    await deleteVersion({ versionRepository }, "version-1");
    expect(versionRepository.delete).toHaveBeenCalledWith("version-1");
  });

  it("refuses to delete a version with fixed issues", async () => {
    const versionRepository = makeRepo(3);
    await expect(deleteVersion({ versionRepository }, "version-1")).rejects.toThrow(VersionNotDeletableError);
    expect(versionRepository.delete).not.toHaveBeenCalled();
  });
});
