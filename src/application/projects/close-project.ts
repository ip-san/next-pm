import { planClose, planReopen } from "@/domain/project/lifecycle";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";

async function subtreeOf(projectRepository: ProjectRepository, projectId: string): Promise<Project[]> {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }
  return [project, ...(await projectRepository.listDescendants(projectId))];
}

/** Redmine's Project#close — the project and its active descendants become read-only. */
export async function closeProject(projectRepository: ProjectRepository, projectId: string): Promise<void> {
  const plan = planClose(await subtreeOf(projectRepository, projectId));
  if (plan.ids.length > 0) {
    await projectRepository.updateStatusForIds(plan.ids, plan.status);
  }
}

/** Redmine's Project#reopen — the project and its closed descendants become active again. */
export async function reopenProject(projectRepository: ProjectRepository, projectId: string): Promise<void> {
  const plan = planReopen(await subtreeOf(projectRepository, projectId));
  if (plan.ids.length > 0) {
    await projectRepository.updateStatusForIds(plan.ids, plan.status);
  }
}
