import type { Project, ProjectStatus } from "./entity";
import { isWithinSubtree } from "./nested-set";

/** Which projects a status change touches, and the status they all end up in. */
export interface StatusChangePlan {
  projectIds: string[];
  status: ProjectStatus;
}

type ProjectNode = Pick<Project, "id" | "lft" | "rgt" | "status">;

function subtree<T extends ProjectNode>(project: ProjectNode, all: T[]): T[] {
  return all.filter((candidate) => isWithinSubtree(project, candidate));
}

function selfAndAncestors<T extends ProjectNode>(project: ProjectNode, all: T[]): T[] {
  return all.filter((candidate) => isWithinSubtree(candidate, project));
}

/**
 * Redmine's Project#archive! — recurses into every child, so the whole subtree goes with
 * the project. Archiving is unconditional on the current status (an already-closed
 * subproject becomes archived too), unlike close/reopen below.
 *
 * The caller must first run `archiveBlockingVersionIds` — Project#archive refuses when an
 * issue *outside* the subtree is assigned to one of the subtree's versions, because
 * archiving would hide a version that an issue still visible elsewhere depends on.
 */
export function planArchive(project: ProjectNode, all: ProjectNode[]): StatusChangePlan {
  return { projectIds: subtree(project, all).map((p) => p.id), status: "archived" };
}

/**
 * Redmine's Project#archive guard: version ids of the subtree that an issue from outside
 * the subtree points at. Non-empty means the archive must be refused.
 */
export function archiveBlockingVersionIds(
  project: ProjectNode,
  all: ProjectNode[],
  versions: { id: string; projectId: string }[],
  issues: { projectId: string; fixedVersionId: string | null }[],
): string[] {
  const inSubtree = new Set(subtree(project, all).map((p) => p.id));
  const subtreeVersionIds = new Set(versions.filter((version) => inSubtree.has(version.projectId)).map((version) => version.id));
  const blocking = new Set<string>();
  for (const issue of issues) {
    if (issue.fixedVersionId && !inSubtree.has(issue.projectId) && subtreeVersionIds.has(issue.fixedVersionId)) {
      blocking.add(issue.fixedVersionId);
    }
  }
  return [...blocking];
}

/**
 * Redmine's Project#unarchive — self *and its archived ancestors*, never its descendants.
 * A subproject archived in its own right stays archived, which is what makes "unarchive
 * this one project" a safe operation on a deep tree. The target status is closed when any
 * ancestor is closed, so unarchiving never reopens a project inside a closed parent.
 */
export function planUnarchive(project: ProjectNode, all: ProjectNode[]): StatusChangePlan {
  const chain = selfAndAncestors(project, all);
  const anyAncestorClosed = chain.some((candidate) => candidate.id !== project.id && candidate.status === "closed");
  return {
    projectIds: chain.filter((candidate) => candidate.status === "archived").map((candidate) => candidate.id),
    status: anyAncestorClosed ? "closed" : "active",
  };
}

/** Redmine's Project#close — every *active* project in the subtree becomes closed. */
export function planClose(project: ProjectNode, all: ProjectNode[]): StatusChangePlan {
  return {
    projectIds: subtree(project, all)
      .filter((candidate) => candidate.status === "active")
      .map((candidate) => candidate.id),
    status: "closed",
  };
}

/** Redmine's Project#reopen — every *closed* project in the subtree becomes active again. */
export function planReopen(project: ProjectNode, all: ProjectNode[]): StatusChangePlan {
  return {
    projectIds: subtree(project, all)
      .filter((candidate) => candidate.status === "closed")
      .map((candidate) => candidate.id),
    status: "active",
  };
}
