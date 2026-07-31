import type { CompiledPredicate } from "@/domain/query/filter-builder";
import type { Issue } from "./entity";

export interface IssueUpdate {
  statusId?: string;
  priorityId?: string;
  subject?: string;
  description?: string;
  assignedToId?: string | null;
  fixedVersionId?: string | null;
  categoryId?: string | null;
  isPrivate?: boolean;
  doneRatio?: number;
  estimatedHours?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface IssueRepository {
  findById(id: string): Promise<Issue | null>;
  listByProject(projectId: string, predicates?: CompiledPredicate[]): Promise<Issue[]>;
  /** Across every project — callers must filter by per-project visibility themselves. */
  findByAssignee(userId: string): Promise<Issue[]>;
  /** Across every project — callers must filter by per-project visibility themselves. */
  findByAuthor(userId: string): Promise<Issue[]>;
  /** Across every project — callers must filter by per-project visibility themselves. */
  findByIds(ids: string[]): Promise<Issue[]>;
  create(issue: Omit<Issue, "id" | "lockVersion" | "createdAt" | "updatedAt">): Promise<Issue>;
  /**
   * Applies `changes` only if `expectedLockVersion` still matches the stored row
   * (`UPDATE ... WHERE id = ? AND lock_version = ?`), mirroring Redmine's optimistic
   * locking. Throws StaleIssueError when the row moved on (0 rows affected) or vanished.
   */
  update(id: string, expectedLockVersion: number, changes: IssueUpdate): Promise<Issue>;
  /** Full-text search over subject/description, scoped to one project. */
  search(projectId: string, query: string): Promise<Issue[]>;
}
