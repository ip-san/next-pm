import { desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { news, newsComments } from "@/infrastructure/db/schema/news";
import type { News, NewsComment } from "@/domain/news/entity";
import type { NewsCommentRepository, NewsRepository } from "@/domain/news/repository";

function toDomain(row: typeof news.$inferSelect): News {
  return {
    id: row.id,
    projectId: row.projectId,
    authorId: row.authorId,
    title: row.title,
    summary: row.summary,
    description: row.description,
    createdAt: row.createdAt,
  };
}

function commentToDomain(row: typeof newsComments.$inferSelect): NewsComment {
  return { id: row.id, newsId: row.newsId, authorId: row.authorId, content: row.content, createdAt: row.createdAt };
}

export class DrizzleNewsRepository implements NewsRepository {
  async listByProject(projectId: string): Promise<News[]> {
    const rows = await db.select().from(news).where(eq(news.projectId, projectId)).orderBy(desc(news.createdAt));
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<News | null> {
    const [row] = await db.select().from(news).where(eq(news.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: Omit<News, "id" | "createdAt">): Promise<News> {
    const [row] = await db
      .insert(news)
      .values({ projectId: input.projectId, authorId: input.authorId, title: input.title, summary: input.summary, description: input.description })
      .returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(news).where(eq(news.id, id));
  }
}

export class DrizzleNewsCommentRepository implements NewsCommentRepository {
  async listByNews(newsId: string): Promise<NewsComment[]> {
    const rows = await db.select().from(newsComments).where(eq(newsComments.newsId, newsId)).orderBy(newsComments.createdAt);
    return rows.map(commentToDomain);
  }

  async create(input: Omit<NewsComment, "id" | "createdAt">): Promise<NewsComment> {
    const [row] = await db.insert(newsComments).values({ newsId: input.newsId, authorId: input.authorId, content: input.content }).returning();
    return commentToDomain(row);
  }
}
