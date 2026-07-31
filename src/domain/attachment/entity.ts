export type AttachmentContainerType = "Issue" | "Message" | "News";

export interface Attachment {
  id: string;
  containerType: AttachmentContainerType;
  containerId: string;
  authorId: string;
  /** Original client filename — display only, never used to build a filesystem path. */
  filename: string;
  /** Server-generated opaque storage key (uuid) — the only value ever used to address the file on disk. */
  storageKey: string;
  contentType: string;
  fileSize: number;
  createdAt: Date;
}
