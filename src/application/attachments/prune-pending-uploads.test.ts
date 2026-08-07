import { describe, expect, it, mock } from "bun:test";
import { prunePendingUploads } from "./prune-pending-uploads";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";

function expiredAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    containerType: null,
    containerId: null,
    authorId: "user-1",
    filename: "orphan.png",
    storageKey: "storage-key-1",
    contentType: "image/png",
    fileSize: 10,
    digest: "a".repeat(64),
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    ...overrides,
  };
}

function makeRepos(expired: Attachment[]) {
  const attachmentRepository: AttachmentRepository = {
    listByContainer: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (a) => ({ ...a, id: "new", createdAt: new Date() }) as Attachment),
    attachToContainer: mock(async () => {}),
    delete: mock(async () => {}),
    listPendingOlderThan: mock(async () => expired),
  };
  const attachmentStorage: AttachmentStorage = {
    save: mock(async () => "generated-key"),
    read: mock(async () => Buffer.from("")),
    delete: mock(async () => {}),
  };
  return { attachmentRepository, attachmentStorage };
}

describe("prunePendingUploads", () => {
  it("deletes both the storage file and the row for each expired pending upload", async () => {
    const expired = [expiredAttachment({ id: "att-1", storageKey: "key-1" }), expiredAttachment({ id: "att-2", storageKey: "key-2" })];
    const repos = makeRepos(expired);

    const count = await prunePendingUploads(repos);

    expect(count).toBe(2);
    expect(repos.attachmentStorage.delete).toHaveBeenCalledWith("key-1");
    expect(repos.attachmentStorage.delete).toHaveBeenCalledWith("key-2");
    expect(repos.attachmentRepository.delete).toHaveBeenCalledWith("att-1");
    expect(repos.attachmentRepository.delete).toHaveBeenCalledWith("att-2");
  });

  it("does nothing and returns 0 when there is nothing expired", async () => {
    const repos = makeRepos([]);
    const count = await prunePendingUploads(repos);
    expect(count).toBe(0);
    expect(repos.attachmentStorage.delete).not.toHaveBeenCalled();
    expect(repos.attachmentRepository.delete).not.toHaveBeenCalled();
  });

  it("queries with a cutoff of roughly 24 hours ago", async () => {
    const repos = makeRepos([]);
    await prunePendingUploads(repos);
    const cutoff = (repos.attachmentRepository.listPendingOlderThan as ReturnType<typeof mock>).mock.calls[0][0] as Date;
    const expectedCutoff = Date.now() - 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
  });
});
