import type { Version } from "./entity";

export interface VersionRepository {
  /** Versions owned by this project only (not versions shared into it from elsewhere). */
  listByProject(projectId: string): Promise<Version[]>;
  /**
   * Mirrors Redmine's Project#shared_versions — every version assignable from this project:
   * its own versions, plus any other project's version whose sharing setting reaches this
   * project (computed via domain/version/sharing.ts against the projects' nested-set bounds).
   */
  listSharedWith(projectId: string): Promise<Version[]>;
  findById(id: string): Promise<Version | null>;
  create(version: Omit<Version, "id" | "createdAt" | "updatedAt">): Promise<Version>;
  update(
    id: string,
    changes: Partial<Pick<Version, "name" | "description" | "effectiveDate" | "status" | "sharing" | "wikiPageTitle">>,
  ): Promise<Version>;
  delete(id: string): Promise<void>;
  /** Count of issues with fixed_version_id = id, used to gate deletion like Version#deletable?. */
  countFixedIssues(id: string): Promise<number>;
}
