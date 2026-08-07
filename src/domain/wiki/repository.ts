import type { WikiContentVersion, WikiPage, WikiRedirect } from "./entity";

export interface WikiPageRepository {
  listForProject(projectId: string): Promise<WikiPage[]>;
  findById(id: string): Promise<WikiPage | null>;
  findByTitle(projectId: string, title: string): Promise<WikiPage | null>;
  create(page: Omit<WikiPage, "id">): Promise<WikiPage>;
  rename(id: string, newTitle: string): Promise<WikiPage>;
}

export interface WikiRedirectRepository {
  findByTitle(projectId: string, title: string): Promise<WikiRedirect | null>;
  /**
   * Repoints every redirect that targeted `oldTarget` to `newTarget` instead, so a lookup
   * never needs to follow more than one hop. A row that would become self-referential in the
   * process (its own title equals the new target) is deleted instead of updated.
   */
  retarget(projectId: string, oldTarget: string, newTarget: string): Promise<void>;
  deleteByTitle(projectId: string, title: string): Promise<void>;
  create(entry: { projectId: string; title: string; redirectsToTitle: string }): Promise<WikiRedirect>;
}

export interface WikiSearchHit {
  page: WikiPage;
  currentVersion: WikiContentVersion;
}

export interface WikiVersionWithPage {
  page: WikiPage;
  version: WikiContentVersion;
}

export interface WikiContentRepository {
  /** Highest-version content row for the page, i.e. its current text. */
  findCurrent(pageId: string): Promise<WikiContentVersion | null>;
  findVersion(pageId: string, version: number): Promise<WikiContentVersion | null>;
  listVersions(pageId: string): Promise<WikiContentVersion[]>;
  /** Appends a new version — never mutates an existing row (mirrors WikiContentVersion's append-only history). */
  createVersion(entry: Omit<WikiContentVersion, "id" | "createdAt">): Promise<WikiContentVersion>;
  /** Full-text search over each page's title and its *current* version's text, scoped to one project. */
  search(projectId: string, query: string): Promise<WikiSearchHit[]>;
  /** Every version of every page in the project (not just the current one) — activity feed. */
  listByProject(projectId: string): Promise<WikiVersionWithPage[]>;
}
