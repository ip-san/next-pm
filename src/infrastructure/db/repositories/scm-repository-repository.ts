import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { scmRepositories } from "@/infrastructure/db/schema/scm-repositories";
import type { ScmRepository } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

function toDomain(row: typeof scmRepositories.$inferSelect): ScmRepository {
  return { id: row.id, projectId: row.projectId, rootPath: row.rootPath };
}

export class DrizzleScmRepositoryRepository implements ScmRepositoryRepository {
  async findByProject(projectId: string): Promise<ScmRepository | null> {
    const [row] = await db.select().from(scmRepositories).where(eq(scmRepositories.projectId, projectId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(repository: Omit<ScmRepository, "id">): Promise<ScmRepository> {
    const [row] = await db
      .insert(scmRepositories)
      .values({ projectId: repository.projectId, rootPath: repository.rootPath })
      .returning();
    return toDomain(row);
  }
}
