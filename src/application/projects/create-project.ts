import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";

export interface CreateProjectInput {
  name: string;
  identifier: string;
  description: string;
  isPublic: boolean;
  parentId: string | null;
  enabledModules: string[];
  trackerIds: string[];
}

export async function createProject(
  projectRepository: ProjectRepository,
  input: CreateProjectInput,
): Promise<Project> {
  const existing = await projectRepository.findByIdentifier(input.identifier);
  if (existing) {
    throw new Error(`Project identifier "${input.identifier}" is already taken`);
  }

  return projectRepository.createUnderParent(
    {
      name: input.name,
      identifier: input.identifier,
      description: input.description,
      isPublic: input.isPublic,
      status: "active",
      parentId: input.parentId,
      position: 0,
      enabledModules: input.enabledModules,
      trackerIds: input.trackerIds,
    },
    input.parentId,
  );
}
