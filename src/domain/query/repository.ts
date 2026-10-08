import type { QueryType, SavedQuery } from "./entity";

export type SavedQueryDraft = Omit<SavedQuery, "id">;
/** The fields a Query edit may change — everything except who owns it and what it queries. */
export type SavedQueryUpdate = Omit<SavedQuery, "id" | "userId" | "type">;

export interface QueryRepository {
  /** Unfiltered by visibility — callers must apply isQueryVisible themselves. */
  listForProject(projectId: string, type: QueryType): Promise<SavedQuery[]>;
  /** Unfiltered by visibility — callers must apply isQueryVisible themselves. */
  findById(id: string): Promise<SavedQuery | null>;
  create(query: SavedQueryDraft): Promise<SavedQuery>;
  /** Replaces the query's settings, including its queries_roles rows. */
  update(id: string, changes: SavedQueryUpdate): Promise<SavedQuery>;
  delete(id: string): Promise<void>;
}
