import { describe, expect, it, mock } from "bun:test";
import { deleteVersion, VersionNotDeletableError } from "./delete-version";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository } from "@/domain/attachment/repository";
import type { VersionRepository } from "@/domain/version/repository";

function makeAttachmentRepo(files: Attachment[] = []): AttachmentRepository {
  return {
    listByContainer: mock(async () => files),
    listByContainers: mock(async () => files),
    findById: mock(async () => null),
    create: mock(async () => {
      throw new Error("not implemented");
    }),
    update: mock(async () => {
      throw new Error("not implemented");
    }),
    incrementDownloads: mock(async () => {}),
    attachToContainer: mock(async () => {}),
    delete: mock(async () => {}),
    listPendingOlderThan: mock(async () => []),
  };
}

function versionFile(): Attachment {
  return {
    id: "att-1",
    containerType: "Version",
    containerId: "version-1",
    authorId: "user-1",
    filename: "release.zip",
    storageKey: "key-1",
    contentType: "application/zip",
    fileSize: 10,
    digest: "a".repeat(64),
    description: "",
    downloads: 0,
    createdAt: new Date(),
  };
}

function makeRepo(fixedIssueCount: number): VersionRepository {
  return {
    listByProject: mock(async () => []),
    listByProjects: mock(async () => []),
    listSharedWith: mock(async () => []),
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
    await deleteVersion({ versionRepository, attachmentRepository: makeAttachmentRepo() }, "version-1");
    expect(versionRepository.delete).toHaveBeenCalledWith("version-1");
  });

  it("refuses to delete a version with fixed issues", async () => {
    const versionRepository = makeRepo(3);
    await expect(deleteVersion({ versionRepository, attachmentRepository: makeAttachmentRepo() }, "version-1")).rejects.toThrow(
      VersionNotDeletableError,
    );
    expect(versionRepository.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a version that still holds files", async () => {
    const versionRepository = makeRepo(0);
    await expect(
      deleteVersion({ versionRepository, attachmentRepository: makeAttachmentRepo([versionFile()]) }, "version-1"),
    ).rejects.toThrow(VersionNotDeletableError);
    expect(versionRepository.delete).not.toHaveBeenCalled();
  });
});
