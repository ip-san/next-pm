import { PENDING_UPLOAD_EXPIRY_MS } from "@/domain/attachment/pending-upload";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";

/**
 * Mirrors Redmine's Attachment.prune, but run lazily on the next upload rather than via a
 * separate cron/rake task (see README.md's "no time-triggered async processing exists"
 * design note) — every createPendingUpload call sweeps whatever's expired first, so an
 * abandoned upload never outlives the next real one by more than one sweep. redeemUploadToken
 * separately rejects an expired token synchronously, which stays in place as defense in depth
 * for the window before a sweep runs.
 */
export async function prunePendingUploads(repositories: {
  attachmentRepository: AttachmentRepository;
  attachmentStorage: AttachmentStorage;
}): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_UPLOAD_EXPIRY_MS);
  const expired = await repositories.attachmentRepository.listPendingOlderThan(cutoff);
  for (const attachment of expired) {
    await repositories.attachmentStorage.delete(attachment.storageKey);
    await repositories.attachmentRepository.delete(attachment.id);
  }
  return expired.length;
}
