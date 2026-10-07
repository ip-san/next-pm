import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository } from "@/domain/attachment/repository";
import { validateAttachmentDescription, validateAttachmentFilename } from "@/domain/attachment/validate";

export class AttachmentNotFoundError extends Error {}

export interface UpdateAttachmentMetadataInput {
  attachmentId: string;
  filename?: string;
  description?: string;
}

/**
 * Mirrors AttachmentsController#update + Attachment's `safe_attributes 'filename',
 * 'content_type', 'description'`. content_type is deliberately not writable here: ours comes
 * from the upload and is echoed back in Content-Disposition/nosniff headers, so letting a
 * client rewrite it would hand it a lever on how the bytes are served.
 */
export async function updateAttachmentMetadata(
  repositories: { attachmentRepository: AttachmentRepository },
  input: UpdateAttachmentMetadataInput,
): Promise<Attachment> {
  const attachment = await repositories.attachmentRepository.findById(input.attachmentId);
  if (!attachment) {
    throw new AttachmentNotFoundError("添付ファイルが見つかりません。");
  }

  const changes: { filename?: string; description?: string } = {};
  if (input.filename !== undefined) {
    validateAttachmentFilename(input.filename);
    changes.filename = input.filename;
  }
  if (input.description !== undefined) {
    validateAttachmentDescription(input.description);
    changes.description = input.description;
  }
  if (Object.keys(changes).length === 0) {
    return attachment;
  }

  return repositories.attachmentRepository.update(attachment.id, changes);
}
