import type { TimeEntry } from "./entity";

export interface TimeEntryRepository {
  listForProject(projectId: string): Promise<TimeEntry[]>;
  listForIssue(issueId: string): Promise<TimeEntry[]>;
  create(entry: Omit<TimeEntry, "id" | "createdAt">): Promise<TimeEntry>;
}
