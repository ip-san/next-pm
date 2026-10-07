import type { Project, ProjectStatus } from "./entity";
import type { NestedSetNode } from "./nested-set";

export interface ProjectSettingsUpdate {
  name: string;
  description: string;
  isPublic: boolean;
  enabledModules: string[];
  trackerIds: string[];
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
