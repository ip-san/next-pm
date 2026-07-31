import type { Document } from "./entity";

export interface DocumentRepository {
  listByProject(projectId: string): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  create(document: Omit<Document, "id" | "createdAt">): Promise<Document>;
  delete(id: string): Promise<void>;
}
