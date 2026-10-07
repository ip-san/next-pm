import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { queries, queriesRoles } from "@/infrastructure/db/schema/queries";
import type { FilterCondition } from "@/domain/query/filter-builder";
import type { QueryType, SavedQuery } from "@/domain/query/entity";
import type { QueryRepository, SavedQueryDraft, SavedQueryUpdate } from "@/domain/query/repository";
import type { SortCriterion } from "@/domain/query/sort";

async function attachRoleIds(rows: (typeof queries.$inferSelect)[]): Promise<SavedQuery[]> {
  const result: SavedQuery[] = [];
  for (const row of rows) {
    const roleRows = await db.select({ roleId: queriesRoles.roleId }).from(queriesRoles).where(eq(queriesRoles.queryId, row.id));
    result.push({
      id: row.id,
      name: row.name,
      type: row.type,
      projectId: row.projectId,
      userId: row.userId,
      visibility: row.visibility,
      filters: row.filters as FilterCondition[],
      columnNames: row.columnNames,
      groupBy: row.groupBy,
      sortCriteria: row.sortCriteria as SortCriterion[],
      totalableNames: row.totalableNames,
      roleIds: roleRows.map((r) => r.roleId),
    });
  }
  return result;
}

/**
 * Redmine clears a query's roles whenever its visibility stops being "roles"
 * (`after_save { query.roles.clear ... }`), so the join rows can't outlive the setting that
 * gives them meaning.
 */
async function replaceRoleIds(queryId: string, visibility: SavedQuery["visibility"], roleIds: string[]): Promise<void> {
  await db.delete(queriesRoles).where(eq(queriesRoles.queryId, queryId));
  if (visibility === "roles" && roleIds.length > 0) {
    await db.insert(queriesRoles).values(roleIds.map((roleId) => ({ queryId, roleId })));
  }
}

export class DrizzleQueryRepository implements QueryRepository {
  async listForProject(projectId: string, type: QueryType = "IssueQuery"): Promise<SavedQuery[]> {
    const rows = await db
      .select()
      .from(queries)
      .where(and(eq(queries.projectId, projectId), eq(queries.type, type)))
      .orderBy(queries.name);
    return attachRoleIds(rows);
  }

  async findById(id: string): Promise<SavedQuery | null> {
    const [row] = await db.select().from(queries).where(eq(queries.id, id));
    if (!row) return null;
    const [saved] = await attachRoleIds([row]);
    return saved;
  }

  async create(query: SavedQueryDraft): Promise<SavedQuery> {
    const [row] = await db
      .insert(queries)
      .values({
        name: query.name,
        type: query.type,
        projectId: query.projectId,
        userId: query.userId,
        visibility: query.visibility,
        filters: query.filters,
        columnNames: query.columnNames,
        groupBy: query.groupBy,
        sortCriteria: query.sortCriteria,
        totalableNames: query.totalableNames,
      })
      .returning();

    await replaceRoleIds(row.id, query.visibility, query.roleIds);
    return { ...query, id: row.id };
  }

  async update(id: string, changes: SavedQueryUpdate): Promise<SavedQuery> {
    const [row] = await db
      .update(queries)
      .set({
        name: changes.name,
        projectId: changes.projectId,
        visibility: changes.visibility,
        filters: changes.filters,
        columnNames: changes.columnNames,
        groupBy: changes.groupBy,
        sortCriteria: changes.sortCriteria,
        totalableNames: changes.totalableNames,
      })
      .where(eq(queries.id, id))
      .returning();

    await replaceRoleIds(id, changes.visibility, changes.roleIds);
    const [saved] = await attachRoleIds([row]);
    return saved;
  }

  async delete(id: string): Promise<void> {
    await db.delete(queries).where(eq(queries.id, id));
  }
}
