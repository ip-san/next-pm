import type { IssueCategory } from "./entity";

export interface IssueCategoryRepository {
  listByProject(projectId: string): Promise<IssueCategory[]>;
  findById(id: string): Promise<IssueCategory | null>;
  create(category: Omit<IssueCategory, "id">): Promise<IssueCategory>;
  update(id: string, changes: { name?: string; assignedToId?: string | null }): Promise<IssueCategory>;
  delete(id: string): Promise<void>;
}
