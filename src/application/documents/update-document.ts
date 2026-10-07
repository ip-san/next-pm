import type { Document } from "@/domain/document/entity";
import type { DocumentRepository } from "@/domain/document/repository";
import { InvalidDocumentError, validateDocumentFields } from "@/domain/document/validate";

export { InvalidDocumentError };

export interface UpdateDocumentInput {
  documentId: string;
  categoryId: string;
  title: string;
  description: string;
}

/**
 * Mirrors DocumentsController#update, behind `edit_documents` (preparation.rb maps
 * documents#edit/#update to it). The same three safe attributes as #create; Redmine's #update
 * deliberately does not touch attachments, which arrive through #add_attachment instead.
 */
export async function updateDocument(repositories: { documentRepository: DocumentRepository }, input: UpdateDocumentInput): Promise<Document> {
  validateDocumentFields(input.title, input.categoryId);

  return repositories.documentRepository.update(input.documentId, {
    categoryId: input.categoryId,
    title: input.title,
    description: input.description,
  });
}
