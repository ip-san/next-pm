import type { Attachment, AttachmentContainerType } from "./entity";

export interface AttachmentRepository {
  listByContainer(containerType: AttachmentContainerType, containerId: string): Promise<Attachment[]>;
  /** Same as listByContainer for many containers at once — the Files page's version groups. */
  listByContainers(containerType: AttachmentContainerType, containerIds: string[]): Promise<Attachment[]>;
  findById(id: string): Promise<Attachment | null>;
  create(attachment: Omit<Attachment, "id" | "createdAt" | "downloads">): Promise<Attachment>;
  /** Redmine's Attachment safe_attributes, minus content_type (ours is server-derived). */
  update(id: string, changes: { filename?: string; description?: string }): Promise<Attachment>;
  /** Redmine's Attachment#increment_download, called from the download endpoint. */
  incrementDownloads(id: string): Promise<void>;
  /** Redeems a pending upload: attaches a container-less attachment to a real container. */
  attachToContainer(id: string, containerType: AttachmentContainerType, containerId: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Pending (container-less) uploads never redeemed before `cutoff` — candidates for pruning. */
  listPendingOlderThan(cutoff: Date): Promise<Attachment[]>;
}

/** Storage port — infrastructure implements this; domain/application never touch the filesystem directly. */
export interface AttachmentStorage {
  save(data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
