import type { Document } from "@/domain/document/entity";
import type { DocumentRepository } from "@/domain/document/repository";

export class InvalidDocumentError extends Error {}

export interface CreateDocumentInput {
  projectId: string;
  categoryId: string;
  title: string;
  description: string;
}

/** Mirrors Document's validates_presence_of :title/:category, validates_length_of :title (max 255). */
export async function createDocument(repositories: { documentRepository: DocumentRepository }, input: CreateDocumentInput): Promise<Document> {
  if (input.title.trim().length === 0 || input.title.length > 255) {
    throw new InvalidDocumentError("タイトルは1〜255文字で入力してください。");
  }
  if (input.categoryId.trim().length === 0) {
    throw new InvalidDocumentError("カテゴリを選択してください。");
  }

  return repositories.documentRepository.create({
    projectId: input.projectId,
    categoryId: input.categoryId,
    title: input.title,
    description: input.description,
  });
}
