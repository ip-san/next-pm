import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { NewsRepository } from "@/domain/news/repository";

/**
 * Mirrors NewsController#destroy. The news_comments cascade handles
 * `has_many :comments, :dependent => :delete_all`; attachments are polymorphic and carry no
 * foreign key, so their rows and files are swept here the way `acts_as_attachable`'s
 * dependent-destroy would.
 */
export async function deleteNews(
  repositories: { newsRepository: NewsRepository; attachmentRepository: AttachmentRepository; attachmentStorage: AttachmentStorage },
  newsId: string,
): Promise<void> {
  const attachments = await repositories.attachmentRepository.listByContainer("News", newsId);
  for (const attachment of attachments) {
    await repositories.attachmentRepository.delete(attachment.id);
    await repositories.attachmentStorage.delete(attachment.storageKey);
  }

  await repositories.newsRepository.delete(newsId);
}
