import type { Project, ProjectStatus } from "./entity";
import type { NestedSetNode } from "./nested-set";

export interface ProjectSettingsUpdate {
  name: string;
  description: string;
  isPublic: boolean;
  enabledModules: string[];
  trackerIds: string[];
}

/**
 * Raised by `deleteSubtree` when the tree read inside the transaction turns out to have
 * subprojects the caller is not allowed to take with it (Redmine's Project#deletable?
 * `leaf?` clause). Lives beside the port so both the Drizzle implementation that detects it
 * and the use case that translates it can see it without depending on each other.
 */
export class ProjectHasSubprojectsError extends Error {
  constructor() {
    super("The project has subprojects, which only an administrator may delete along with it.");
    this.name = "ProjectHasSubprojectsError";
  }
}

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByIdentifier(identifier: string): Promise<Project | null>;
  listAll(): Promise<Project[]>;
  listNestedSetNodes(): Promise<NestedSetNode[]>;
  /** Every descendant subproject (not including `projectId` itself), via the lft/rgt nested set. */
  listDescendants(projectId: string): Promise<Project[]>;
  /** Persists a new project as the rightmost child of `parentId` (or a new root if null). */
  createUnderParent(
    project: Omit<Project, "id" | "lft" | "rgt">,
    parentId: string | null,
  ): Promise<Project>;
  /**
   * Updates the settings a project's own admin/manager can change themselves — not
   * identifier (immutable once created), parent (a nested-set restructure), or status
   * (archive/close have their own cascading semantics) — mirrors Redmine's settings tab.
   */
  updateSettings(id: string, settings: ProjectSettingsUpdate): Promise<Project>;
  /**
   * Sets `status` on every listed project in one statement — the archive/unarchive/close/
   * reopen actions each resolve the projects they touch first (domain/project/status-change.ts)
   * and then apply the whole set at once, like Redmine's `update_all` on a nested-set scope.
   */
  updateStatus(projectIds: string[], status: ProjectStatus): Promise<void>;
  /**
   * Deletes `rootProjectId` and its whole subtree, and rewrites the surviving nodes' bounds.
   *
   * Everything happens in one transaction that *re-reads* the nested set under
   * `SELECT ... FOR UPDATE`: the subtree a caller saw a moment ago is not the subtree that
   * exists now, and a child inserted in between would otherwise be deleted without its own
   * authorization check, or left behind with the bounds rewritten around it. The row lock
   * also blocks that insert, because a child's foreign key takes a conflicting key-share
   * lock on its parent.
   *
   * `allowNonLeaf` is the caller's authorization verdict, re-applied inside the transaction
   * against the freshly read tree: Redmine's Project#deletable? lets an administrator take a
   * subtree, but a non-admin permission holder only a leaf. Throws
   * ProjectHasSubprojectsError when the fresh read disagrees.
   *
   * Most of the cascade is the schema's own `ON DELETE CASCADE`. What this adds is the rows
   * no foreign key reaches: the five polymorphic tables (attachments, custom_values,
   * watchers, reactions, journals) whose target is a type string plus an id. The deleted
   * attachments' storage keys come back so the caller can unlink the files *after* the
   * transaction commits.
   */
  deleteSubtree(
    rootProjectId: string,
    options: { allowNonLeaf: boolean },
  ): Promise<{ removedProjectIds: string[]; attachmentStorageKeys: string[] }>;
  /**
   * Mirrors Redmine's Project#copy, scoped to what this codebase calls the project
   * "skeleton" — members, issue categories, and versions. Everything else Redmine's copy
   * supports (issues, wiki, queries, boards, documents, attachments) is deferred to a future
   * cycle: issues alone carry parent/child insert-ordering, category/version remapping,
   * custom field values, and relations all at once, and the skeleton already delivers most
   * of "clone a project as a template" on its own. Group-principal members are skipped too —
   * copying one would need to re-materialize an inherited row per group user (see
   * application/groups/group-membership.ts), which is its own chunk of work.
   *
   * Runs as one transaction: the new project and every copied row commit together, or none
   * of them do — there is intentionally no partial-copy state to clean up after a failure.
   */
  copySkeletonFrom(
    sourceProjectId: string,
    project: Omit<Project, "id" | "lft" | "rgt">,
    parentId: string | null,
  ): Promise<Project>;
}
