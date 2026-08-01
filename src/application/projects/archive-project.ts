import { planArchive, planUnarchive } from "@/domain/project/lifecycle";
import type { IssueRepository } from "@/domain/issue/repository";
import type { ProjectRepository } from "@/domain/project/repository";
import type { VersionRepository } from "@/domain/version/repository";

/** Redmine's Project#archive returning false — an outside issue targets a version of the subtree. */
export class ArchiveBlockedError extends Error {
  constructor() {
    super("他のプロジェクトのチケットがこのプロジェクト(またはサブプロジェクト)のバージョンを対象にしているため、アーカイブできません。");
    this.name = "ArchiveBlockedError";
  }
}

/**
 * Redmine's Project#archive — archives the project and all its descendants, unless an
 * issue outside the subtree is fixed to one of the subtree's versions (shared versions
 * would leave that issue pointing at an archived project's version).
 */
export async function archiveProject(
  projectRepository: ProjectRepository,
  versionRepository: VersionRepository,
  issueRepository: IssueRepository,
  projectId: string,
): Promise<void> {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  const subtree = [project, ...(await projectRepository.listDescendants(projectId))];
  const subtreeIds = subtree.map((p) => p.id);

  const versionIds = (await Promise.all(subtreeIds.map((id) => versionRepository.listByProject(id))))
    .flat()
    .map((v) => v.id);
  if (versionIds.length > 0 && (await issueRepository.existsOutsideProjectsWithFixedVersion(versionIds, subtreeIds))) {
    throw new ArchiveBlockedError();
  }

  const plan = planArchive(subtree);
  await projectRepository.updateStatusForIds(plan.ids, plan.status);
}

/** Redmine's Project#unarchive — restores the project along with any archived ancestors. */
export async function unarchiveProject(projectRepository: ProjectRepository, projectId: string): Promise<void> {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  const ancestors = await projectRepository.listAncestors(projectId);
  const plan = planUnarchive(project, ancestors);
  if (plan.ids.length > 0) {
    await projectRepository.updateStatusForIds(plan.ids, plan.status);
  }
}
