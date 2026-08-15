import type { Journal } from "./entity";

export interface JournalRepository {
  findById(id: string): Promise<Journal | null>;
  listForIssue(issueId: string): Promise<Journal[]>;
  /** Every journal across every issue in the project — activity feed. */
  listByProject(projectId: string): Promise<Journal[]>;
  create(journal: Omit<Journal, "id" | "createdAt">): Promise<Journal>;
}
