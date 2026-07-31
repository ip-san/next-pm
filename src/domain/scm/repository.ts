import type { ScmRepository } from "./entity";

export interface ScmRepositoryRepository {
  findByProject(projectId: string): Promise<ScmRepository | null>;
  create(repository: Omit<ScmRepository, "id">): Promise<ScmRepository>;
}
