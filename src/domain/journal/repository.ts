import type { Journal } from "./entity";

export interface JournalRepository {
  listForIssue(issueId: string): Promise<Journal[]>;
  create(journal: Omit<Journal, "id" | "createdAt">): Promise<Journal>;
}
