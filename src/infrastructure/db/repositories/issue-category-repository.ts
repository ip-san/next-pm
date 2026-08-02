import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issueCategories } from "@/infrastructure/db/schema/issue-categories";
import { issues } from "@/infrastructure/db/schema/issues";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { IssueCategoryRepository } from "@/domain/issue-category/repository";

function toDomain(row: typeof issueCategories.$inferSelect): IssueCategory {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    assignedToId: row.assignedToId,
  };
}

export class DrizzleIssueCategoryRepository implements IssueCategoryRepository {
  async listByProject(projectId: string): Promise<IssueCategory[]> {
    const rows = await db.select().from(issueCategories).where(eq(issueCategories.projectId, projectId));
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<IssueCategory | null> {
    const [row] = await db.select().from(issueCategories).where(eq(issueCategories.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(category: Omit<IssueCategory, "id">): Promise<IssueCategory> {
    const [row] = await db
      .insert(issueCategories)
      .values({ projectId: category.projectId, name: category.name, assignedToId: category.assignedToId })
      .returning();
    return toDomain(row);
  }

  async update(id: string, changes: { name?: string; assignedToId?: string | null }): Promise<IssueCategory> {
    const [row] = await db.update(issueCategories).set(changes).where(eq(issueCategories.id, id)).returning();
    return toDomain(row);
  }

  /**
   * `issues.category_id` has no ON DELETE clause (defaults to Postgres's NO ACTION), so
   * deleting a category with issues still assigned to it would otherwise fail with a foreign
   * key violation. Mirrors Redmine's IssueCategoriesController#destroy without a
   * `reassign_to_id` — issues simply lose their category rather than blocking the delete.
   */
  async delete(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(issues).set({ categoryId: null }).where(eq(issues.categoryId, id));
      await tx.delete(issueCategories).where(eq(issueCategories.id, id));
    });
  }
}
