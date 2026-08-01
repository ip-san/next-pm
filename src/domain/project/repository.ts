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
  /** Every ancestor (not including `projectId` itself), root first, via the lft/rgt nested set. */
  listAncestors(projectId: string): Promise<Project[]>;
  /** Bulk status transition for close/reopen/archive/unarchive plans (domain/project/lifecycle.ts). */
  updateStatusForIds(ids: string[], status: ProjectStatus): Promise<void>;
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
}
