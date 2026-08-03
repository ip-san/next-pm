import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { attachments } from "@/infrastructure/db/schema/attachments";
import type { Attachment, AttachmentContainerType } from "@/domain/attachment/entity";
import type { AttachmentRepository } from "@/domain/attachment/repository";

function toDomain(row: typeof attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    containerType: row.containerType as AttachmentContainerType | null,
    containerId: row.containerId,
    authorId: row.authorId,
    filename: row.filename,
    storageKey: row.storageKey,
    contentType: row.contentType,
    fileSize: row.fileSize,
    digest: row.digest,
    createdAt: row.createdAt,
  };
}

export class DrizzleAttachmentRepository implements AttachmentRepository {
  async listByContainer(containerType: AttachmentContainerType, containerId: string): Promise<Attachment[]> {
    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.containerType, containerType), eq(attachments.containerId, containerId)))
      .orderBy(attachments.createdAt);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Attachment | null> {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(attachment: Omit<Attachment, "id" | "createdAt">): Promise<Attachment> {
    const [row] = await db
      .insert(attachments)
      .values({
        containerType: attachment.containerType,
        containerId: attachment.containerId,
        authorId: attachment.authorId,
        filename: attachment.filename,
        storageKey: attachment.storageKey,
        contentType: attachment.contentType,
        fileSize: attachment.fileSize,
        digest: attachment.digest,
      })
      .returning();
    return toDomain(row);
  }

  async attachToContainer(id: string, containerType: AttachmentContainerType, containerId: string): Promise<void> {
    await db.update(attachments).set({ containerType, containerId }).where(eq(attachments.id, id));
  }

  async delete(id: string): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }
}
