export class InvalidAttachmentError extends Error {}

const MAX_FILENAME_LENGTH = 255;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Port of Attachment's filename/size validations — client filename is display-only, never a path. */
export function validateAttachmentInput(filename: string, fileSize: number): void {
  if (filename.trim().length === 0) {
    throw new InvalidAttachmentError("filename must not be empty");
  }
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw new InvalidAttachmentError(`filename must be at most ${MAX_FILENAME_LENGTH} characters`);
  }
  if (fileSize <= 0) {
    throw new InvalidAttachmentError("file must not be empty");
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new InvalidAttachmentError(`file must be at most ${MAX_FILE_SIZE_BYTES} bytes`);
  }
}
