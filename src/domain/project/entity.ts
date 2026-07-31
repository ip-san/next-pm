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
