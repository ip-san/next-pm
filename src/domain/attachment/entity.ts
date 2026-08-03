export type AttachmentContainerType = "Issue" | "Message" | "News" | "Document";

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
  createdAt: Date;
}

/** Mirrors Redmine's Attachment#token: "id.digest", redeemed once by attachToContainer. */
export function attachmentToken(attachment: Pick<Attachment, "id" | "digest">): string {
  return `${attachment.id}.${attachment.digest}`;
}
