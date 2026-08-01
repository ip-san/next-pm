import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";

export interface CopyProjectInput {
  sourceProjectId: string;
  name: string;
  identifier: string;
  description: string;
  isPublic: boolean;
  parentId: string | null;
  enabledModules: string[];
  trackerIds: string[];
}

export async function copyProject(
  projectRepository: ProjectRepository,
  input: CopyProjectInput,
): Promise<Project> {
  const source = await projectRepository.findById(input.sourceProjectId);
  if (!source) {
    throw new Error(`Project ${input.sourceProjectId} not found`);
  }

  const existing = await projectRepository.findByIdentifier(input.identifier);
  if (existing) {
    throw new Error(`Project identifier "${input.identifier}" is already taken`);
  }

  return projectRepository.copySkeletonFrom(
    input.sourceProjectId,
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
