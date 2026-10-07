import type { News } from "@/domain/news/entity";
import type { NewsRepository } from "@/domain/news/repository";
import { InvalidNewsError, validateNewsFields } from "@/domain/news/validate";

export { InvalidNewsError };

export interface CreateNewsInput {
  projectId: string;
  authorId: string;
  title: string;
  summary: string;
  description: string;
}

/** Mirrors NewsController#create with `safe_attributes 'title', 'summary', 'description'`. */
export async function createNews(repositories: { newsRepository: NewsRepository }, input: CreateNewsInput): Promise<News> {
  validateNewsFields(input.title, input.summary, input.description);

  return repositories.newsRepository.create({
    projectId: input.projectId,
    authorId: input.authorId,
    title: input.title,
    summary: input.summary,
    description: input.description,
  });
}
