import type { News } from "@/domain/news/entity";
import type { NewsRepository } from "@/domain/news/repository";

export class InvalidNewsError extends Error {}

export interface CreateNewsInput {
  projectId: string;
  authorId: string;
  title: string;
  summary: string;
  description: string;
}

/** Mirrors News' validates_presence_of :title/:description, validates_length_of :title (max 60), :summary (max 255). */
export async function createNews(repositories: { newsRepository: NewsRepository }, input: CreateNewsInput): Promise<News> {
  if (input.title.trim().length === 0 || input.title.length > 60) {
    throw new InvalidNewsError("タイトルは1〜60文字で入力してください。");
  }
  if (input.summary.length > 255) {
    throw new InvalidNewsError("概要は255文字以内で入力してください。");
  }
  if (input.description.trim().length === 0) {
    throw new InvalidNewsError("本文を入力してください。");
  }

  return repositories.newsRepository.create({
    projectId: input.projectId,
    authorId: input.authorId,
    title: input.title,
    summary: input.summary,
    description: input.description,
  });
}
