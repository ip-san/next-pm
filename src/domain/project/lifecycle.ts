import type { Project, ProjectStatus } from "./entity";
import { isArchivedProject, isClosedProject } from "./entity";

type ProjectForLifecycle = Pick<Project, "id" | "status">;

/** A bulk status transition: set every project in `ids` to `status` (single UPDATE, like Redmine's update_all). */
export interface StatusChangePlan {
  ids: string[];
  status: ProjectStatus;
}

/** Redmine's Project#close — closes the project and its active descendants. */
export function planClose(selfAndDescendants: ProjectForLifecycle[]): StatusChangePlan {
  return {
    ids: selfAndDescendants.filter((p) => p.status === "active").map((p) => p.id),
    status: "closed",
  };
}

/** Redmine's Project#reopen — reopens the project and its closed descendants. */
export function planReopen(selfAndDescendants: ProjectForLifecycle[]): StatusChangePlan {
  return {
    ids: selfAndDescendants.filter((p) => isClosedProject(p)).map((p) => p.id),
    status: "active",
  };
}

/** Redmine's Project#archive! — archives the project and every descendant, whatever their status. */
export function planArchive(selfAndDescendants: ProjectForLifecycle[]): StatusChangePlan {
  return { ids: selfAndDescendants.map((p) => p.id), status: "archived" };
}

/**
 * Redmine's Project#unarchive — restores the project and its archived ancestors (a child
 * cannot be active under an archived parent), to closed rather than active when any
 * ancestor is closed.
 */
export function planUnarchive(self: ProjectForLifecycle, ancestors: ProjectForLifecycle[]): StatusChangePlan {
  return {
    ids: [self, ...ancestors].filter((p) => isArchivedProject(p)).map((p) => p.id),
    status: ancestors.some((p) => isClosedProject(p)) ? "closed" : "active",
  };
}
