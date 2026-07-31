import type { Version } from "./entity";

export interface VersionRepository {
  listByProject(projectId: string): Promise<Version[]>;
  findById(id: string): Promise<Version | null>;
  create(version: Omit<Version, "id" | "createdAt" | "updatedAt">): Promise<Version>;
  update(id: string, changes: Partial<Pick<Version, "name" | "description" | "effectiveDate" | "status" | "wikiPageTitle">>): Promise<Version>;
  delete(id: string): Promise<void>;
  /** Count of issues with fixed_version_id = id, used to gate deletion like Version#deletable?. */
  countFixedIssues(id: string): Promise<number>;
}
