export class InvalidAttachmentError extends Error {}

const MAX_FILENAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 255;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Port of Attachment's filename/size validations — client filename is display-only, never a
 * path. `maxSizeBytes` defaults to next-pm's original hardcoded limit; callers with access to
 * the admin-configurable `attachment_max_size` setting (see domain/settings/general-settings.ts)
 * should pass its resolved value instead.
 */
export function validateAttachmentInput(filename: string, fileSize: number, maxSizeBytes: number = DEFAULT_MAX_FILE_SIZE_BYTES): void {
  validateAttachmentFilename(filename);
  if (fileSize <= 0) {
    throw new InvalidAttachmentError("file must not be empty");
  }
  if (fileSize > maxSizeBytes) {
    throw new InvalidAttachmentError(`file must be at most ${maxSizeBytes} bytes`);
  }
}

/**
 * Filename-only half of the validation above — renaming an already-stored attachment (Redmine's
 * Attachment safe_attributes 'filename') must not re-check a size that is already a fact.
 */
export function validateAttachmentFilename(filename: string): void {
  if (filename.trim().length === 0) {
    throw new InvalidAttachmentError("filename must not be empty");
  }
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw new InvalidAttachmentError(`filename must be at most ${MAX_FILENAME_LENGTH} characters`);
  }
}

/** attachments.description is a string column in Redmine — same 255 limit as the filename. */
export function validateAttachmentDescription(description: string): void {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new InvalidAttachmentError(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
}
