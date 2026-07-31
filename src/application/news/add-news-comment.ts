import type { NewsComment } from "@/domain/news/entity";
import type { NewsCommentRepository } from "@/domain/news/repository";

export class InvalidNewsCommentError extends Error {}

export interface AddNewsCommentInput {
  newsId: string;
  authorId: string;
  content: string;
}

export async function addNewsComment(
  repositories: { newsCommentRepository: NewsCommentRepository },
  input: AddNewsCommentInput,
): Promise<NewsComment> {
  if (input.content.trim().length === 0) {
    throw new InvalidNewsCommentError("コメントを入力してください。");
  }

  return repositories.newsCommentRepository.create({
    newsId: input.newsId,
    authorId: input.authorId,
    content: input.content,
  });
}
