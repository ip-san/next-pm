import { desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { documents } from "@/infrastructure/db/schema/documents";
import type { Document } from "@/domain/document/entity";
import type { DocumentRepository } from "@/domain/document/repository";

function toDomain(row: typeof documents.$inferSelect): Document {
  return {
    id: row.id,
    projectId: row.projectId,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
  };
}

export class DrizzleDocumentRepository implements DocumentRepository {
  async listByProject(projectId: string): Promise<Document[]> {
    const rows = await db.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(desc(documents.createdAt));
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Document | null> {
    const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: Omit<Document, "id" | "createdAt">): Promise<Document> {
    const [row] = await db
      .insert(documents)
      .values({ projectId: input.projectId, categoryId: input.categoryId, title: input.title, description: input.description })
      .returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }
}
