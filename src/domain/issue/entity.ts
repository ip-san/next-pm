export interface Issue {
  id: string;
  projectId: string;
  trackerId: string;
  statusId: string;
  priorityId: string;
  subject: string;
  description: string;
  authorId: string;
  assignedToId: string | null;
  assignedToType: "user" | "group" | null;
  parentId: string | null;
  fixedVersionId: string | null;
  categoryId: string | null;
  isPrivate: boolean;
  doneRatio: number;
  estimatedHours: number | null;
  startDate: string | null;
  dueDate: string | null;
  /** Optimistic-locking counter mirroring Redmine's `lock_version` — bumped on every update. */
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export class StaleIssueError extends Error {
  constructor(issueId: string) {
    super(`Issue ${issueId} was modified by someone else; reload and retry.`);
    this.name = "StaleIssueError";
  }
}
