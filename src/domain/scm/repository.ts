import type { ScmRepository } from "./entity";

export interface ScmRepositoryRepository {
  findByProject(projectId: string): Promise<ScmRepository | null>;
  /** createdAt is assigned by the database (defaults to now()) — see schema/scm-repositories.ts. */
  create(repository: Omit<ScmRepository, "id" | "createdAt">): Promise<ScmRepository>;
}
