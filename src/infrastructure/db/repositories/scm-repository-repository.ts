import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { scmRepositories } from "@/infrastructure/db/schema/scm-repositories";
import type { ScmRepository, ScmVendor } from "@/domain/scm/entity";
import { compareScmRepositories } from "@/domain/scm/identifier";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

function toDomain(row: typeof scmRepositories.$inferSelect): ScmRepository {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    isDefault: row.isDefault,
    vendor: row.vendor as ScmVendor,
    rootPath: row.rootPath,
    createdAt: row.createdAt,
  };
}

export class DrizzleScmRepositoryRepository implements ScmRepositoryRepository {
  async findById(id: string): Promise<ScmRepository | null> {
    const [row] = await db.select().from(scmRepositories).where(eq(scmRepositories.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async listByProject(projectId: string): Promise<ScmRepository[]> {
    const rows = await db.select().from(scmRepositories).where(eq(scmRepositories.projectId, projectId));
    return rows.map(toDomain).sort(compareScmRepositories);
  }

  async findDefaultForProject(projectId: string): Promise<ScmRepository | null> {
    // Sorted so the `?? [0]` fallback mirrors Redmine's find_project_repository
    // (`@project.repository || @project.repositories.first`) deterministically rather than in
    // whatever order the rows happen to come back — a project left with no default (Redmine
    // never re-elects one when the default is deleted) should still resolve to a stable
    // repository instead of a different one per request.
    const repositories = await this.listByProject(projectId);
    return repositories.find((repository) => repository.isDefault) ?? repositories[0] ?? null;
  }

  async create(repository: Omit<ScmRepository, "id" | "createdAt">): Promise<ScmRepository> {
    const [row] = await db
      .insert(scmRepositories)
      .values({
        projectId: repository.projectId,
        identifier: repository.identifier,
        isDefault: repository.isDefault,
        vendor: repository.vendor,
        rootPath: repository.rootPath,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, attributes: { identifier: string; isDefault: boolean }): Promise<void> {
    await db
      .update(scmRepositories)
      .set({ identifier: attributes.identifier, isDefault: attributes.isDefault })
      .where(eq(scmRepositories.id, id));
  }

  async clearDefaultForProject(projectId: string): Promise<void> {
    await db.update(scmRepositories).set({ isDefault: false }).where(eq(scmRepositories.projectId, projectId));
  }

  async delete(id: string): Promise<void> {
    await db.delete(scmRepositories).where(eq(scmRepositories.id, id));
  }
}
