import type { Attachment, AttachmentContainerType } from "./entity";

export interface AttachmentRepository {
  listByContainer(containerType: AttachmentContainerType, containerId: string): Promise<Attachment[]>;
  findById(id: string): Promise<Attachment | null>;
  create(attachment: Omit<Attachment, "id" | "createdAt">): Promise<Attachment>;
  delete(id: string): Promise<void>;
}

/** Storage port — infrastructure implements this; domain/application never touch the filesystem directly. */
export interface AttachmentStorage {
  save(data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
