import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { queries, queriesRoles } from "@/infrastructure/db/schema/queries";
import type { FilterCondition } from "@/domain/query/filter-builder";
import type { SavedQuery } from "@/domain/query/entity";
import type { QueryRepository } from "@/domain/query/repository";

async function attachRoleIds(rows: (typeof queries.$inferSelect)[]): Promise<SavedQuery[]> {
  const result: SavedQuery[] = [];
  for (const row of rows) {
    const roleRows = await db.select({ roleId: queriesRoles.roleId }).from(queriesRoles).where(eq(queriesRoles.queryId, row.id));
    result.push({
      id: row.id,
      name: row.name,
      projectId: row.projectId,
      userId: row.userId,
      visibility: row.visibility,
      filters: row.filters as FilterCondition[],
      roleIds: roleRows.map((r) => r.roleId),
    });
  }
  return result;
}

export class DrizzleQueryRepository implements QueryRepository {
  async listForProject(projectId: string): Promise<SavedQuery[]> {
    const rows = await db.select().from(queries).where(eq(queries.projectId, projectId));
    return attachRoleIds(rows);
  }

  async findById(id: string): Promise<SavedQuery | null> {
    const [row] = await db.select().from(queries).where(eq(queries.id, id));
    if (!row) return null;
    const [saved] = await attachRoleIds([row]);
    return saved;
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

    if (query.visibility === "roles" && query.roleIds.length > 0) {
      await db.insert(queriesRoles).values(query.roleIds.map((roleId) => ({ queryId: row.id, roleId })));
    }

    return { ...query, id: row.id };
  }
}
