import type { News, NewsComment } from "./entity";

export interface NewsRepository {
  listByProject(projectId: string): Promise<News[]>;
  findById(id: string): Promise<News | null>;
  create(news: Omit<News, "id" | "createdAt">): Promise<News>;
  delete(id: string): Promise<void>;
}

export interface NewsCommentRepository {
  listByNews(newsId: string): Promise<NewsComment[]>;
  create(comment: Omit<NewsComment, "id" | "createdAt">): Promise<NewsComment>;
}
