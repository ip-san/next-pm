import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { queries } from "@/infrastructure/db/schema/queries";
import type { FilterCondition } from "@/domain/query/filter-builder";
import type { SavedQuery } from "@/domain/query/entity";
import type { QueryRepository } from "@/domain/query/repository";

function toDomain(row: typeof queries.$inferSelect): SavedQuery {
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    userId: row.userId,
    visibility: row.visibility,
    filters: row.filters as FilterCondition[],
  };
}

export class DrizzleQueryRepository implements QueryRepository {
  async listForProject(projectId: string): Promise<SavedQuery[]> {
    const rows = await db.select().from(queries).where(eq(queries.projectId, projectId));
    return rows.map(toDomain);
  }

  async create(query: Omit<SavedQuery, "id">): Promise<SavedQuery> {
    const [row] = await db
      .insert(queries)
      .values({
        name: query.name,
        projectId: query.projectId,
        userId: query.userId,
        visibility: query.visibility,
        filters: query.filters,
      })
      .returning();
    return toDomain(row);
  }
}
