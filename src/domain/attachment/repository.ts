import type { Attachment, AttachmentContainerType } from "./entity";

export interface AttachmentRepository {
  listByContainer(containerType: AttachmentContainerType, containerId: string): Promise<Attachment[]>;
  findById(id: string): Promise<Attachment | null>;
  create(attachment: Omit<Attachment, "id" | "createdAt">): Promise<Attachment>;
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
