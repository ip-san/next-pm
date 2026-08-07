import type { Attachment, AttachmentContainerType } from "@/domain/attachment/entity";
import { computeDigest } from "@/domain/attachment/digest";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import { validateAttachmentInput } from "@/domain/attachment/validate";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export class InvalidUploadTokenError extends Error {}

// Mirrors Redmine's Attachment.prune (floating uploads older than 1 day are garbage-collected),
// but enforced synchronously at redemption time instead of via a separate cron/rake task —
// this codebase has no scheduled-job runner that fits a delete-after-N-hours sweep yet.
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.([0-9a-f]{64})$/;

export interface CreatePendingUploadInput {
  authorId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

/**
 * Mirrors Redmine's AttachmentsController#upload: stores a file with no container yet, keyed by
 * a token (id.digest) redeemed later when the caller creates/updates the thing it belongs to.
 */
export async function createPendingUpload(
  repositories: { attachmentRepository: AttachmentRepository; attachmentStorage: AttachmentStorage; settingsRepository: SettingsRepository },
  input: CreatePendingUploadInput,
): Promise<Attachment> {
  const { attachmentMaxSizeBytes } = resolveGeneralSettings(await repositories.settingsRepository.getAll());
  validateAttachmentInput(input.filename, input.data.byteLength, attachmentMaxSizeBytes);

  const storageKey = await repositories.attachmentStorage.save(input.data);

  return repositories.attachmentRepository.create({
    containerType: null,
    containerId: null,
    authorId: input.authorId,
    filename: input.filename,
    storageKey,
    contentType: input.contentType || "application/octet-stream",
    fileSize: input.data.byteLength,
    digest: computeDigest(input.data),
  });
}

export interface RedeemUploadTokenInput {
  token: string;
  /** The caller attaching the file — must be the same user who uploaded it (see module note below). */
  uploaderId: string;
  containerType: AttachmentContainerType;
  containerId: string;
}

/**
 * Mirrors Redmine's Attachment.find_by_token + attach_files, with one deliberate hardening:
 * Redmine's token (id.digest) is a bearer capability — anyone who obtains it can attach the
 * file, since digest only proves content integrity, not who uploaded it. Requiring the
 * redeeming user to match the uploader closes that "leaked/guessed token" gap without changing
 * the token's wire format.
 */
export async function redeemUploadToken(
  repositories: { attachmentRepository: AttachmentRepository },
  input: RedeemUploadTokenInput,
): Promise<Attachment> {
  const match = TOKEN_PATTERN.exec(input.token);
  if (!match) {
    throw new InvalidUploadTokenError("malformed token");
  }
  const [, id, digest] = match;

  const attachment = await repositories.attachmentRepository.findById(id);
  if (!attachment || attachment.digest !== digest) {
    throw new InvalidUploadTokenError("unknown token");
  }
  if (attachment.containerType !== null || attachment.containerId !== null) {
    throw new InvalidUploadTokenError("token already redeemed");
  }
  if (attachment.authorId !== input.uploaderId) {
    throw new InvalidUploadTokenError("token belongs to a different user");
  }
  if (Date.now() - attachment.createdAt.getTime() > TOKEN_EXPIRY_MS) {
    throw new InvalidUploadTokenError("token expired");
  }

  await repositories.attachmentRepository.attachToContainer(id, input.containerType, input.containerId);
  return { ...attachment, containerType: input.containerType, containerId: input.containerId };
}
