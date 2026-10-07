export type AttachmentContainerType = "Issue" | "Message" | "News" | "Document" | "WikiPage" | "Project" | "Version";

export interface Attachment {
  id: string;
  /**
   * Null together with containerId for a pending upload — created via POST /api/v1/uploads,
   * not yet attached to anything. Mirrors Redmine's Attachment#container, which is nil until
   * the upload token is redeemed against a real container.
   */
  containerType: AttachmentContainerType | null;
  containerId: string | null;
  authorId: string;
  /** Original client filename — display only, never used to build a filesystem path. */
  filename: string;
  /** Server-generated opaque storage key (uuid) — the only value ever used to address the file on disk. */
  storageKey: string;
  contentType: string;
  fileSize: number;
  /** SHA-256 hex digest of the file content — the second half of the upload token (id.digest). */
  digest: string;
  /** Free-text caption, editable after upload (Redmine's safe_attributes 'description'). */
  description: string;
  /**
   * Redmine only counts downloads of Project/Version files (AttachmentsController#download),
   * so this stays 0 for issue/wiki/document attachments.
   */
  downloads: number;
  createdAt: Date;
}

/** Redmine's `Redmine::Thumbnail::ALLOWED_TYPES`, minus application/pdf (no Ghostscript here). */
const THUMBNAILABLE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"];

/**
 * Mirrors Attachment#thumbnailable? — "does a thumbnail link make sense for this?", answered
 * from the stored content type so a listing can decide without opening every file.
 *
 * This is a hint, never an authorization or safety decision: the stored content type came
 * from the uploading client and can say image/png about anything at all. The thumbnail
 * endpoint re-derives the real format from the file's bytes
 * (domain/attachment/thumbnail-input.ts) before any renderer sees it, exactly as Redmine does
 * in Redmine::Thumbnail.generate, and answers 404 when the two disagree.
 */
export function isThumbnailable(attachment: Pick<Attachment, "contentType">): boolean {
  return THUMBNAILABLE_CONTENT_TYPES.includes(attachment.contentType.split(";")[0].trim().toLowerCase());
}

/** Mirrors Redmine's Attachment#token: "id.digest", redeemed once by attachToContainer. */
export function attachmentToken(attachment: Pick<Attachment, "id" | "digest">): string {
  return `${attachment.id}.${attachment.digest}`;
}
