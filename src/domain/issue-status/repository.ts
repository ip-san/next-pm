import type { Positioned } from "@/domain/ordering/positioned";
import type { IssueStatus } from "./entity";

export interface IssueStatusRepository {
  findById(id: string): Promise<IssueStatus | null>;
  listAll(): Promise<IssueStatus[]>;
  create(status: Omit<IssueStatus, "id">): Promise<IssueStatus>;
}

/**
 * The write surface only the admin screen needs, kept apart from IssueStatusRepository so the
 * issue-side use cases (which merely look statuses up) don't depend on destructive operations.
 */
export interface IssueStatusAdminRepository {
  update(
    id: string,
    changes: Pick<IssueStatus, "name" | "description" | "isClosed" | "defaultDoneRatio">,
  ): Promise<IssueStatus>;
  /** Also clears the workflow rows naming this status, like IssueStatus#delete_workflow_rules. */
  delete(id: string): Promise<void>;
  /** Count of issues with status_id = id — the first half of IssueStatus#check_integrity. */
  countIssuesUsing(id: string): Promise<number>;
  /** Count of trackers with default_status_id = id — the second half of IssueStatus#check_integrity. */
  countTrackersDefaultingTo(id: string): Promise<number>;
  updatePositions(positions: Positioned[]): Promise<void>;
}
