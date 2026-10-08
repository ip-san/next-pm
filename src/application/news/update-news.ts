import type { News } from "@/domain/news/entity";
import type { NewsRepository } from "@/domain/news/repository";
import { InvalidNewsError, validateNewsFields } from "@/domain/news/validate";

export { InvalidNewsError };

export interface UpdateNewsInput {
  newsId: string;
  title: string;
  summary: string;
  description: string;
}

/**
 * Mirrors NewsController#update: the same `safe_attributes 'title', 'summary', 'description'`
 * as #create, behind `manage_news` (preparation.rb maps news#edit/#update to it). The author
 * gets no separate "edit own" rule in Redmine, so neither does this.
 */
export async function updateNews(repositories: { newsRepository: NewsRepository }, input: UpdateNewsInput): Promise<News> {
  validateNewsFields(input.title, input.summary, input.description);

  return repositories.newsRepository.update(input.newsId, {
    title: input.title,
    summary: input.summary,
    description: input.description,
  });
}
