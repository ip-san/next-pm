import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { wikiContentVersions, wikiPages } from "@/infrastructure/db/schema/wiki";
import type { WikiContentVersion, WikiPage } from "@/domain/wiki/entity";
import type { WikiContentRepository, WikiPageRepository } from "@/domain/wiki/repository";

function pageToDomain(row: typeof wikiPages.$inferSelect): WikiPage {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    parentId: row.parentId,
    isProtected: row.isProtected,
  };
}

function versionToDomain(row: typeof wikiContentVersions.$inferSelect): WikiContentVersion {
  return {
    id: row.id,
    pageId: row.pageId,
    version: row.version,
    authorId: row.authorId,
    text: row.text,
    comments: row.comments,
    createdAt: row.createdAt,
  };
}

export class DrizzleWikiPageRepository implements WikiPageRepository {
  async listForProject(projectId: string): Promise<WikiPage[]> {
    const rows = await db.select().from(wikiPages).where(eq(wikiPages.projectId, projectId)).orderBy(wikiPages.title);
    return rows.map(pageToDomain);
  }

  async findByTitle(projectId: string, title: string): Promise<WikiPage | null> {
    const [row] = await db
      .select()
      .from(wikiPages)
      .where(and(eq(wikiPages.projectId, projectId), eq(wikiPages.title, title)))
      .limit(1);
    return row ? pageToDomain(row) : null;
  }

  async create(page: Omit<WikiPage, "id">): Promise<WikiPage> {
    const [row] = await db
      .insert(wikiPages)
      .values({ projectId: page.projectId, title: page.title, parentId: page.parentId, isProtected: page.isProtected })
      .returning();
    return pageToDomain(row);
  }
}

export class DrizzleWikiContentRepository implements WikiContentRepository {
  async findCurrent(pageId: string): Promise<WikiContentVersion | null> {
    const [row] = await db
      .select()
      .from(wikiContentVersions)
      .where(eq(wikiContentVersions.pageId, pageId))
      .orderBy(desc(wikiContentVersions.version))
      .limit(1);
    return row ? versionToDomain(row) : null;
  }

  async findVersion(pageId: string, version: number): Promise<WikiContentVersion | null> {
    const [row] = await db
      .select()
      .from(wikiContentVersions)
      .where(and(eq(wikiContentVersions.pageId, pageId), eq(wikiContentVersions.version, version)))
      .limit(1);
    return row ? versionToDomain(row) : null;
  }

  async listVersions(pageId: string): Promise<WikiContentVersion[]> {
    const rows = await db
      .select()
      .from(wikiContentVersions)
      .where(eq(wikiContentVersions.pageId, pageId))
      .orderBy(desc(wikiContentVersions.version));
    return rows.map(versionToDomain);
  }

  async createVersion(entry: Omit<WikiContentVersion, "id" | "createdAt">): Promise<WikiContentVersion> {
    const [row] = await db
      .insert(wikiContentVersions)
      .values({
        pageId: entry.pageId,
        version: entry.version,
        authorId: entry.authorId,
        text: entry.text,
        comments: entry.comments,
      })
      .returning();
    return versionToDomain(row);
  }
}
