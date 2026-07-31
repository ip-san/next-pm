import type { SavedQuery } from "./entity";

export interface QueryRepository {
  /** Unfiltered by visibility — callers must apply isQueryVisible themselves. */
  listForProject(projectId: string): Promise<SavedQuery[]>;
  /** Unfiltered by visibility — callers must apply isQueryVisible themselves. */
  findById(id: string): Promise<SavedQuery | null>;
  create(query: Omit<SavedQuery, "id">): Promise<SavedQuery>;
}
