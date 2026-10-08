import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { DocumentRepository } from "@/domain/document/repository";

export interface DeleteDocumentRepositories {
  documentRepository: DocumentRepository;
  attachmentRepository: AttachmentRepository;
  attachmentStorage: AttachmentStorage;
}

/**
 * Deletes a document together with its attachments. Attachments address their container
 * polymorphically, with no foreign key for the database to cascade, so deleting the document
 * row alone left both the attachment rows and their files behind — rows pointing at a
 * document that no longer exists, and files nothing would ever reclaim.
 *
 * Mirrors Redmine, where `Document has_many :attachments, as: :container, dependent: :destroy`
 * removes each attachment (and its file) with the document.
 *
 * Rows go before files, as in issue deletion: a leftover file is wasted disk, while a row
 * pointing at a file that is already gone is a broken download. A file that has already
 * vanished is ignored for the same reason.
 */
export async function deleteDocument(repositories: DeleteDocumentRepositories, documentId: string): Promise<void> {
  const attachments = await repositories.attachmentRepository.listByContainer("Document", documentId);

  for (const attachment of attachments) {
    await repositories.attachmentRepository.delete(attachment.id);
  }
  await repositories.documentRepository.delete(documentId);

  for (const attachment of attachments) {
    try {
      await repositories.attachmentStorage.delete(attachment.storageKey);
    } catch {
      continue;
    }
  }
}
