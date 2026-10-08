export type ProjectStatus = "active" | "closed" | "archived";

export interface Project {
  id: string;
  name: string;
  identifier: string;
  description: string;
  isPublic: boolean;
  status: ProjectStatus;
  parentId: string | null;
  lft: number;
  rgt: number;
  position: number;
  enabledModules: string[];
  trackerIds: string[];
}

/** Redmine's Project#active? */
export function isActiveProject(project: Pick<Project, "status">): boolean {
  return project.status === "active";
}

/** Redmine's Project#archived? */
export function isArchivedProject(project: Pick<Project, "status">): boolean {
  return project.status === "archived";
}

/**
 * Redmine's Project#deletable?(user) — an admin may delete any project, including one with
 * subprojects (they go with it). A non-admin needs `delete_project` *and* the project must
 * be a leaf: Redmine 5.1 opened deletion to permission holders but refuses to let one wipe
 * out a subtree they may not hold the permission on project by project.
 *
 * `hasDeletePermission` is the caller's `can({permission: "delete_project", ...})` verdict;
 * delete_project is a read permission, so a *closed* project can still be deleted.
 */
export function isProjectDeletable(input: { isAdmin: boolean; hasDeletePermission: boolean; hasSubprojects: boolean }): boolean {
  return input.isAdmin || (input.hasDeletePermission && !input.hasSubprojects);
}
