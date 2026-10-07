import { describe, expect, it, mock } from "bun:test";
import { AttachmentNotFoundError, updateAttachmentMetadata } from "./update-attachment-metadata";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository } from "@/domain/attachment/repository";
import { InvalidAttachmentError } from "@/domain/attachment/validate";

function existing(): Attachment {
  return {
    id: "att-1",
    containerType: "Project",
    containerId: "project-1",
    authorId: "user-1",
    filename: "release.zip",
    storageKey: "key-1",
    contentType: "application/zip",
    fileSize: 100,
    digest: "a".repeat(64),
    description: "",
    downloads: 3,
    createdAt: new Date(),
  };
}

function makeRepos(attachment: Attachment | null) {
  const attachmentRepository = {
    findById: mock(async () => attachment),
    update: mock(async (id: string, changes: { filename?: string; description?: string }) => ({ ...existing(), ...changes, id })),
  } as unknown as AttachmentRepository;
  return { attachmentRepository };
}

describe("updateAttachmentMetadata", () => {
  it("updates the description", async () => {
    const repos = makeRepos(existing());
    const updated = await updateAttachmentMetadata(repos, { attachmentId: "att-1", description: "配布用" });
    expect(updated.description).toBe("配布用");
    expect(repos.attachmentRepository.update).toHaveBeenCalledWith("att-1", { description: "配布用" });
  });

  it("renames the file without re-checking its size", async () => {
    const repos = makeRepos(existing());
    const updated = await updateAttachmentMetadata(repos, { attachmentId: "att-1", filename: "renamed.zip" });
    expect(updated.filename).toBe("renamed.zip");
  });

  it("rejects an empty filename", async () => {
    const repos = makeRepos(existing());
    await expect(updateAttachmentMetadata(repos, { attachmentId: "att-1", filename: "  " })).rejects.toThrow(InvalidAttachmentError);
    expect(repos.attachmentRepository.update).not.toHaveBeenCalled();
  });

  it("rejects an over-long description", async () => {
    const repos = makeRepos(existing());
    await expect(updateAttachmentMetadata(repos, { attachmentId: "att-1", description: "x".repeat(256) })).rejects.toThrow(
      InvalidAttachmentError,
    );
  });

  it("is a no-op when nothing is given", async () => {
    const repos = makeRepos(existing());
    await updateAttachmentMetadata(repos, { attachmentId: "att-1" });
    expect(repos.attachmentRepository.update).not.toHaveBeenCalled();
  });

  it("reports a missing attachment", async () => {
    const repos = makeRepos(null);
    await expect(updateAttachmentMetadata(repos, { attachmentId: "att-1", description: "x" })).rejects.toThrow(AttachmentNotFoundError);
  });
});
