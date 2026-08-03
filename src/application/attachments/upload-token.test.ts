import { describe, expect, it, mock } from "bun:test";
import { createPendingUpload, InvalidUploadTokenError, redeemUploadToken } from "./upload-token";
import { attachmentToken, type Attachment } from "@/domain/attachment/entity";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const VALID_DIGEST = "a".repeat(64);

function pendingAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: NIL_UUID,
    containerType: null,
    containerId: null,
    authorId: "user-1",
    filename: "photo.png",
    storageKey: "generated-key",
    contentType: "image/png",
    fileSize: 4,
    digest: VALID_DIGEST,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepos(overrides: { attachment?: Attachment | null } = {}) {
  const attachment = overrides.attachment === undefined ? pendingAttachment() : overrides.attachment;
  const attachmentStorage: AttachmentStorage = {
    save: mock(async () => "generated-key"),
    read: mock(async () => Buffer.from("")),
    delete: mock(async () => {}),
  };
  const attachmentRepository: AttachmentRepository = {
    listByContainer: mock(async () => []),
    findById: mock(async () => attachment),
    create: mock(async (a) => ({ ...a, id: NIL_UUID, createdAt: new Date() }) as Attachment),
    attachToContainer: mock(async () => {}),
    delete: mock(async () => {}),
  };
  return { attachmentRepository, attachmentStorage };
}

describe("createPendingUpload", () => {
  it("stores the file with no container and a content digest", async () => {
    const repos = makeRepos();
    const attachment = await createPendingUpload(repos, {
      authorId: "user-1",
      filename: "photo.png",
      contentType: "image/png",
      data: Buffer.from("fake-image-bytes"),
    });
    expect(attachment.containerType).toBeNull();
    expect(attachment.containerId).toBeNull();
    expect(attachment.digest).toHaveLength(64);
  });

  it("rejects an empty file before touching storage", async () => {
    const repos = makeRepos();
    await expect(
      createPendingUpload(repos, { authorId: "user-1", filename: "photo.png", contentType: "image/png", data: Buffer.alloc(0) }),
    ).rejects.toThrow(InvalidAttachmentError);
    expect(repos.attachmentStorage.save).not.toHaveBeenCalled();
  });
});

describe("redeemUploadToken", () => {
  const baseInput = {
    uploaderId: "user-1",
    containerType: "Issue" as const,
    containerId: "issue-1",
  };

  it("attaches a matching, unredeemed, unexpired token to the given container", async () => {
    const repos = makeRepos();
    const token = attachmentToken({ id: NIL_UUID, digest: VALID_DIGEST });
    const attachment = await redeemUploadToken(repos, { ...baseInput, token });
    expect(repos.attachmentRepository.attachToContainer).toHaveBeenCalledWith(NIL_UUID, "Issue", "issue-1");
    expect(attachment.containerType).toBe("Issue");
    expect(attachment.containerId).toBe("issue-1");
  });

  it("rejects a malformed token", async () => {
    const repos = makeRepos();
    await expect(redeemUploadToken(repos, { ...baseInput, token: "not-a-token" })).rejects.toThrow(InvalidUploadTokenError);
  });

  it("rejects a token whose digest doesn't match the stored attachment", async () => {
    const repos = makeRepos({ attachment: pendingAttachment({ digest: "b".repeat(64) }) });
    const token = attachmentToken({ id: NIL_UUID, digest: VALID_DIGEST });
    await expect(redeemUploadToken(repos, { ...baseInput, token })).rejects.toThrow(InvalidUploadTokenError);
  });

  it("rejects a token for an unknown attachment id", async () => {
    const repos = makeRepos({ attachment: null });
    const token = attachmentToken({ id: NIL_UUID, digest: VALID_DIGEST });
    await expect(redeemUploadToken(repos, { ...baseInput, token })).rejects.toThrow(InvalidUploadTokenError);
  });

  it("rejects a token that has already been redeemed", async () => {
    const repos = makeRepos({ attachment: pendingAttachment({ containerType: "News", containerId: "news-1" }) });
    const token = attachmentToken({ id: NIL_UUID, digest: VALID_DIGEST });
    await expect(redeemUploadToken(repos, { ...baseInput, token })).rejects.toThrow(InvalidUploadTokenError);
  });

  it("rejects redemption by a user other than the one who uploaded it", async () => {
    const repos = makeRepos({ attachment: pendingAttachment({ authorId: "user-1" }) });
    const token = attachmentToken({ id: NIL_UUID, digest: VALID_DIGEST });
    await expect(redeemUploadToken(repos, { ...baseInput, uploaderId: "user-2", token })).rejects.toThrow(InvalidUploadTokenError);
  });

  it("rejects a token older than 24 hours", async () => {
    const repos = makeRepos({ attachment: pendingAttachment({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }) });
    const token = attachmentToken({ id: NIL_UUID, digest: VALID_DIGEST });
    await expect(redeemUploadToken(repos, { ...baseInput, token })).rejects.toThrow(InvalidUploadTokenError);
  });
});
