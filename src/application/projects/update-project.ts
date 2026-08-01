import type { Project } from "@/domain/project/entity";
import type { ProjectRepository, ProjectSettingsUpdate } from "@/domain/project/repository";

export async function updateProject(projectRepository: ProjectRepository, projectId: string, settings: ProjectSettingsUpdate): Promise<Project> {
  const existing = await projectRepository.findById(projectId);
  if (!existing) {
    throw new Error(`Project ${projectId} not found`);
  }

  return projectRepository.updateSettings(projectId, settings);
}
