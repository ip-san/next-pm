import type { IssueSearchOptions } from "@/domain/search/entity";
import type { CompiledPredicate } from "@/domain/query/filter-builder";
import type { Issue } from "./entity";

export interface IssueUpdate {
  projectId?: string;
  trackerId?: string;
  statusId?: string;
  priorityId?: string;
  subject?: string;
  description?: string;
  assignedToId?: string | null;
  assignedToType?: "user" | "group" | null;
  parentId?: string | null;
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
  /**
   * Matches issues whose id starts with `prefix` (hex, no dashes) — the mail handler's reply
   * detection uses this against the app's own "#eb0b2d1a" display shorthand, since issues here
   * have no sequential number the way Redmine's do.
   */
  /** The issue with this number (`#123`), or null. */
  findByNumber(number: number): Promise<Issue | null>;
  findByIdPrefix(prefix: string): Promise<Issue[]>;
  listByProject(projectId: string, predicates?: CompiledPredicate[]): Promise<Issue[]>;
  /**
   * Across every project — callers must filter by per-project visibility themselves.
   * Matches issues assigned directly to `userId` or to any group in `userGroupIds`
   * (mirrors Redmine's Issue.assigned_to_condition, which resolves Principal membership).
   */
  findByAssignee(userId: string, userGroupIds: string[]): Promise<Issue[]>;
  /** Across every project — callers must filter by per-project visibility themselves. */
  findByAuthor(userId: string): Promise<Issue[]>;
  /** Across every project — callers must filter by per-project visibility themselves. */
  findByIds(ids: string[]): Promise<Issue[]>;
  /** Direct subtasks only (Redmine's Issue#children); the caller applies visibility. */
  listChildren(parentId: string): Promise<Issue[]>;
  /**
   * Across every project — the archive guard needs to see issues *outside* the subtree it is
   * about to hide, so this deliberately does not take a project scope.
   */
  listByFixedVersionIds(versionIds: string[]): Promise<Issue[]>;
  create(issue: Omit<Issue, "id" | "number" | "lockVersion" | "createdAt" | "updatedAt">): Promise<Issue>;
  /**
   * Applies `changes` only if `expectedLockVersion` still matches the stored row
   * (`UPDATE ... WHERE id = ? AND lock_version = ?`), mirroring Redmine's optimistic
   * locking. Throws StaleIssueError when the row moved on (0 rows affected) or vanished.
   */
  update(id: string, expectedLockVersion: number, changes: IssueUpdate): Promise<Issue>;
  /**
   * Deletes the given issues together with every row that points at them through a
   * polymorphic column the database can't cascade — journals (and their details and
   * reactions), watchers and custom values — in one transaction. Attachment rows go too;
   * their stored files are the caller's to remove, once the transaction has committed.
   * Relations and changeset links cascade in the schema.
   */
  deleteWithDependents(issueIds: string[]): Promise<void>;
  /** Full-text search over subject/description, scoped to one project. */
  /** Redmine's `acts_as_searchable` scope for Issue, across every project the caller already decided is in scope. */
  search(projectIds: string[], criteria: IssueSearchOptions): Promise<Issue[]>;
}
