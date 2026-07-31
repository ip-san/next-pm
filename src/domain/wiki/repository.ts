import type { WikiContentVersion, WikiPage } from "./entity";

export interface WikiPageRepository {
  listForProject(projectId: string): Promise<WikiPage[]>;
  findByTitle(projectId: string, title: string): Promise<WikiPage | null>;
  create(page: Omit<WikiPage, "id">): Promise<WikiPage>;
}

export interface WikiContentRepository {
  /** Highest-version content row for the page, i.e. its current text. */
  findCurrent(pageId: string): Promise<WikiContentVersion | null>;
  findVersion(pageId: string, version: number): Promise<WikiContentVersion | null>;
  listVersions(pageId: string): Promise<WikiContentVersion[]>;
  /** Appends a new version — never mutates an existing row (mirrors WikiContentVersion's append-only history). */
  createVersion(entry: Omit<WikiContentVersion, "id" | "createdAt">): Promise<WikiContentVersion>;
}
