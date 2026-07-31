import { count, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { versions } from "@/infrastructure/db/schema/versions";
import type { Version, VersionStatus } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

function toDomain(row: typeof versions.$inferSelect): Version {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    effectiveDate: row.effectiveDate,
    status: row.status as VersionStatus,
    sharing: "none",
    wikiPageTitle: row.wikiPageTitle,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleVersionRepository implements VersionRepository {
  async listByProject(projectId: string): Promise<Version[]> {
    const rows = await db.select().from(versions).where(eq(versions.projectId, projectId)).orderBy(versions.effectiveDate, versions.name);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Version | null> {
    const [row] = await db.select().from(versions).where(eq(versions.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: Omit<Version, "id" | "createdAt" | "updatedAt">): Promise<Version> {
    const [row] = await db
      .insert(versions)
      .values({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        effectiveDate: input.effectiveDate,
        status: input.status,
        sharing: input.sharing,
        wikiPageTitle: input.wikiPageTitle,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, changes: Partial<Pick<Version, "name" | "description" | "effectiveDate" | "status" | "wikiPageTitle">>): Promise<Version> {
    const [row] = await db
      .update(versions)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(versions.id, id))
      .returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(versions).where(eq(versions.id, id));
  }

  async countFixedIssues(id: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(issues).where(eq(issues.fixedVersionId, id));
    return row?.value ?? 0;
  }
}
