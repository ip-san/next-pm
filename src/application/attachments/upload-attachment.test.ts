import { describe, expect, it, mock } from "bun:test";
import { uploadAttachment } from "./upload-attachment";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";

function makeRepos(overrides: { storage?: Partial<AttachmentStorage> } = {}) {
  const attachmentStorage: AttachmentStorage = {
    save: mock(async () => "generated-key"),
    read: mock(async () => Buffer.from("")),
    delete: mock(async () => {}),
    ...overrides.storage,
  };
  const attachmentRepository: AttachmentRepository = {
    listByContainer: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (attachment) => ({ ...attachment, id: "att-1", createdAt: new Date() }) as Attachment),
    attachToContainer: mock(async () => {}),
    delete: mock(async () => {}),
  };
  return { attachmentRepository, attachmentStorage };
}

const baseInput = {
  containerType: "Issue" as const,
  containerId: "issue-1",
  authorId: "user-1",
  filename: "photo.png",
  contentType: "image/png",
  data: Buffer.from("fake-image-bytes"),
};

describe("uploadAttachment", () => {
  it("stores the file via the storage port and never persists the client filename as a path", async () => {
    const repos = makeRepos();
    const attachment = await uploadAttachment(repos, baseInput);
    expect(repos.attachmentStorage.save).toHaveBeenCalledWith(baseInput.data);
    expect(attachment.storageKey).toBe("generated-key");
    expect(attachment.filename).toBe("photo.png");
  });

  it("rejects an empty file before touching storage", async () => {
    const repos = makeRepos();
    await expect(uploadAttachment(repos, { ...baseInput, data: Buffer.alloc(0) })).rejects.toThrow(InvalidAttachmentError);
    expect(repos.attachmentStorage.save).not.toHaveBeenCalled();
  });

  it("defaults a missing content type to application/octet-stream", async () => {
    const repos = makeRepos();
    const attachment = await uploadAttachment(repos, { ...baseInput, contentType: "" });
    expect(attachment.contentType).toBe("application/octet-stream");
  });
});
