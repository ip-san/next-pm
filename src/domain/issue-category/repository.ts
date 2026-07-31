import type { IssueCategory } from "./entity";

export interface IssueCategoryRepository {
  listByProject(projectId: string): Promise<IssueCategory[]>;
  create(category: Omit<IssueCategory, "id">): Promise<IssueCategory>;
}
