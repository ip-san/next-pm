import type { News, NewsComment } from "./entity";

export interface NewsRepository {
  listByProject(projectId: string): Promise<News[]>;
  findById(id: string): Promise<News | null>;
  create(news: Omit<News, "id" | "createdAt">): Promise<News>;
  delete(id: string): Promise<void>;
  /** Full-text search over title/summary/description, scoped to one project. */
  search(projectId: string, query: string): Promise<News[]>;
}

export interface NewsCommentRepository {
  listByNews(newsId: string): Promise<NewsComment[]>;
  create(comment: Omit<NewsComment, "id" | "createdAt">): Promise<NewsComment>;
}
