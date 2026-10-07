import type { ScmRepository } from "./entity";

export interface ScmRepositoryRepository {
  findById(id: string): Promise<ScmRepository | null>;
  /** Sorted the way Redmine's `Repository#<=>` sorts: the default first, then by identifier. */
  listByProject(projectId: string): Promise<ScmRepository[]>;
  /** The repository served at the project's bare `/repository` path, or null when the project has none. */
  findDefaultForProject(projectId: string): Promise<ScmRepository | null>;
  /** createdAt is assigned by the database (defaults to now()) — see schema/scm-repositories.ts. */
  create(repository: Omit<ScmRepository, "id" | "createdAt">): Promise<ScmRepository>;
  /** Only the two attributes Redmine's safe_attributes still accept after create — see application/scm/update-repository.ts. */
  update(id: string, attributes: { identifier: string; isDefault: boolean }): Promise<void>;
  /** Mirrors Redmine's `check_default` callback: a project has at most one default repository. */
  clearDefaultForProject(projectId: string): Promise<void>;
  /** Changesets (and their issue links) go with it, via the schema's ON DELETE CASCADE. */
  delete(id: string): Promise<void>;
}
