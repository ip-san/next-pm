import type { SavedQuery } from "./entity";

export interface QueryRepository {
  listForProject(projectId: string): Promise<SavedQuery[]>;
  create(query: Omit<SavedQuery, "id">): Promise<SavedQuery>;
}
