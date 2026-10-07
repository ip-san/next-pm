import type { TimeEntry } from "./entity";

/** Fields that stay editable after creation — mirrors TimeEntry's safe_attributes list. */
export type TimeEntryUpdate = Partial<
  Pick<TimeEntry, "issueId" | "userId" | "activityId" | "hours" | "comments" | "spentOn">
>;

export interface TimeEntryRepository {
  listForProject(projectId: string): Promise<TimeEntry[]>;
  listForIssue(issueId: string): Promise<TimeEntry[]>;
  findById(id: string): Promise<TimeEntry | null>;
  create(entry: Omit<TimeEntry, "id" | "createdAt" | "updatedAt">): Promise<TimeEntry>;
  update(id: string, changes: TimeEntryUpdate): Promise<TimeEntry>;
  delete(id: string): Promise<void>;
  /** Mirrors Redmine's after_project_change, which re-points an issue's time entries at the new project. */
  reassignProjectForIssues(issueIds: string[], projectId: string): Promise<void>;
}
