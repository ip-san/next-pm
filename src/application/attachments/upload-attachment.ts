import type { Attachment, AttachmentContainerType } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import { validateAttachmentInput } from "@/domain/attachment/validate";

export interface UploadAttachmentInput {
  containerType: AttachmentContainerType;
  containerId: string;
  authorId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

/**
 * Storage key is always server-generated (never derived from the client filename), so a
 * container/key pair can never be used to escape the storage directory or collide with another
 * attachment's file — this is what makes the download path traversal-safe.
 */
export async function uploadAttachment(
  repositories: { attachmentRepository: AttachmentRepository; attachmentStorage: AttachmentStorage },
  input: UploadAttachmentInput,
): Promise<Attachment> {
  validateAttachmentInput(input.filename, input.data.byteLength);

  const storageKey = await repositories.attachmentStorage.save(input.data);

  return repositories.attachmentRepository.create({
    containerType: input.containerType,
    containerId: input.containerId,
    authorId: input.authorId,
    filename: input.filename,
    storageKey,
    contentType: input.contentType || "application/octet-stream",
    fileSize: input.data.byteLength,
  });
}
