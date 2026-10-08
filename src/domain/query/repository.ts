import type { QueryType, SavedQuery } from "./entity";

export type SavedQueryDraft = Omit<SavedQuery, "id">;
/** The fields a Query edit may change — everything except who owns it and what it queries. */
export type SavedQueryUpdate = Omit<SavedQuery, "id" | "userId" | "type">;

export interface QueryRepository {
  /**
   * Redmine's `Query.global_or_on_project`: a project's list offers its own queries *and*
   * the global ones, while a global list offers only the global ones. Unfiltered by
   * visibility — callers must apply isQueryVisible themselves.
   */
  listAvailableFor(projectId: string | null, type: QueryType): Promise<SavedQuery[]>;
  /** Unfiltered by visibility — callers must apply isQueryVisible themselves. */
  findById(id: string): Promise<SavedQuery | null>;
  create(query: SavedQueryDraft): Promise<SavedQuery>;
  /** Replaces the query's settings, including its queries_roles rows. */
  update(id: string, changes: SavedQueryUpdate): Promise<SavedQuery>;
  delete(id: string): Promise<void>;
}
