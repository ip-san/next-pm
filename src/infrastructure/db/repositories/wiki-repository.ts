import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { wikiContentVersions, wikiPages } from "@/infrastructure/db/schema/wiki";
import type { WikiContentVersion, WikiPage } from "@/domain/wiki/entity";
import type { WikiContentRepository, WikiPageRepository, WikiSearchHit, WikiVersionWithPage } from "@/domain/wiki/repository";

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

  async findById(id: string): Promise<WikiPage | null> {
    const [row] = await db.select().from(wikiPages).where(eq(wikiPages.id, id)).limit(1);
    return row ? pageToDomain(row) : null;
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

  /**
   * DISTINCT ON (page_id) picks each page's highest-version row — Drizzle's typed query
   * builder has no clean way to express "latest row per group" joins, so this one query
   * is raw SQL rather than the builder used everywhere else in this file.
   */
  async search(projectId: string, query: string): Promise<WikiSearchHit[]> {
    const result = await db.execute(sql`
      select wp.id as page_id, wp.project_id, wp.title, wp.parent_id, wp.is_protected,
             wcv.id as version_id, wcv.version, wcv.author_id, wcv.text, wcv.comments, wcv.created_at
      from (
        select distinct on (page_id) *
        from ${wikiContentVersions}
        order by page_id, version desc
      ) wcv
      join ${wikiPages} wp on wp.id = wcv.page_id
      where wp.project_id = ${projectId}
        and to_tsvector('english', wp.title || ' ' || wcv.text) @@ plainto_tsquery('english', ${query})
      order by wp.title
    `);

    return result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        page: {
          id: r.page_id as string,
          projectId: r.project_id as string,
          title: r.title as string,
          parentId: r.parent_id as string | null,
          isProtected: r.is_protected as boolean,
        },
        currentVersion: {
          id: r.version_id as string,
          pageId: r.page_id as string,
          version: r.version as number,
          authorId: r.author_id as string,
          text: r.text as string,
          comments: r.comments as string,
          createdAt: r.created_at as Date,
        },
      };
    });
  }

  /** Every version of every page in the project — activity feed (unlike `search`, not just the current version). */
  async listByProject(projectId: string): Promise<WikiVersionWithPage[]> {
    const rows = await db
      .select({ version: wikiContentVersions, page: wikiPages })
      .from(wikiContentVersions)
      .innerJoin(wikiPages, eq(wikiPages.id, wikiContentVersions.pageId))
      .where(eq(wikiPages.projectId, projectId))
      .orderBy(desc(wikiContentVersions.createdAt));
    return rows.map((row) => ({ page: pageToDomain(row.page), version: versionToDomain(row.version) }));
  }
}
