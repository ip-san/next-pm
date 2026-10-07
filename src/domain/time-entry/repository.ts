import type { TimeEntry } from "./entity";

export interface TimeEntryRepository {
  listForProject(projectId: string): Promise<TimeEntry[]>;
  listForIssue(issueId: string): Promise<TimeEntry[]>;
  create(entry: Omit<TimeEntry, "id" | "createdAt">): Promise<TimeEntry>;
  /** Mirrors Redmine's after_project_change, which re-points an issue's time entries at the new project. */
  reassignProjectForIssues(issueIds: string[], projectId: string): Promise<void>;
}
