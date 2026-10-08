import type { Document } from "./entity";

export interface DocumentRepository {
  listByProject(projectId: string): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  create(document: Omit<Document, "id" | "createdAt">): Promise<Document>;
  /** Redmine's Document safe_attributes: category_id, title, description. */
  update(id: string, changes: { categoryId?: string; title?: string; description?: string }): Promise<Document>;
  delete(id: string): Promise<void>;
}
