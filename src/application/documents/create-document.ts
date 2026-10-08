import type { Document } from "@/domain/document/entity";
import type { DocumentRepository } from "@/domain/document/repository";
import { InvalidDocumentError, validateDocumentFields } from "@/domain/document/validate";

export { InvalidDocumentError };

export interface CreateDocumentInput {
  projectId: string;
  categoryId: string;
  title: string;
  description: string;
}

/** Mirrors DocumentsController#create with `safe_attributes 'category_id', 'title', 'description'`. */
export async function createDocument(repositories: { documentRepository: DocumentRepository }, input: CreateDocumentInput): Promise<Document> {
  validateDocumentFields(input.title, input.categoryId);

  return repositories.documentRepository.create({
    projectId: input.projectId,
    categoryId: input.categoryId,
    title: input.title,
    description: input.description,
  });
}
