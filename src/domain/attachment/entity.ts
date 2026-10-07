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

/**
 * Mirrors Attachment#thumbnailable? (image? && Redmine::Thumbnail.convert_available?) minus
 * SVG: our thumbnails are re-encoded and served inline, and an SVG is a script-bearing
 * document, so it never becomes an inline-rendered image here.
 */
const THUMBNAILABLE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/tiff"];

export function isThumbnailable(attachment: Pick<Attachment, "contentType">): boolean {
  return THUMBNAILABLE_CONTENT_TYPES.includes(attachment.contentType.split(";")[0].trim().toLowerCase());
}

/** Mirrors Redmine's Attachment#token: "id.digest", redeemed once by attachToContainer. */
export function attachmentToken(attachment: Pick<Attachment, "id" | "digest">): string {
  return `${attachment.id}.${attachment.digest}`;
}
