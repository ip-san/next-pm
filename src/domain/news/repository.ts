import type { SearchCriteria } from "@/domain/search/entity";
import type { News, NewsComment } from "./entity";

export interface NewsRepository {
  listByProject(projectId: string): Promise<News[]>;
  findById(id: string): Promise<News | null>;
  create(news: Omit<News, "id" | "createdAt">): Promise<News>;
  /** Redmine's News safe_attributes: title, summary, description. */
  update(id: string, changes: { title?: string; summary?: string; description?: string }): Promise<News>;
  delete(id: string): Promise<void>;
  /** Full-text search over title/summary/description, scoped to one project. */
  search(projectIds: string[], criteria: SearchCriteria): Promise<News[]>;
}

export interface NewsCommentRepository {
  listByNews(newsId: string): Promise<NewsComment[]>;
  findById(id: string): Promise<NewsComment | null>;
  create(comment: Omit<NewsComment, "id" | "createdAt">): Promise<NewsComment>;
  delete(id: string): Promise<void>;
}
