import type { TimeEntry } from "./entity";

export interface TimeEntryRepository {
  listForProject(projectId: string): Promise<TimeEntry[]>;
  listForIssue(issueId: string): Promise<TimeEntry[]>;
  create(entry: Omit<TimeEntry, "id" | "createdAt">): Promise<TimeEntry>;
  /** Mirrors Redmine's after_project_change, which re-points an issue's time entries at the new project. */
  reassignProjectForIssues(issueIds: string[], projectId: string): Promise<void>;
  listForIssues(issueIds: string[]): Promise<TimeEntry[]>;
  /** Redmine's `todo=destroy` on issue deletion (and the API default — `has_many :time_entries, dependent: :destroy`). */
  deleteForIssues(issueIds: string[]): Promise<void>;
  /** Redmine's `todo=nullify` — the entries survive, detached from any issue. */
  detachFromIssues(issueIds: string[]): Promise<void>;
  /** Redmine's `todo=reassign` — entries move to another issue, taking that issue's project. */
  reassignToIssue(issueIds: string[], targetIssueId: string, targetProjectId: string): Promise<void>;
}
