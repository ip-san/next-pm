import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issueCategories } from "@/infrastructure/db/schema/issue-categories";
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

  async create(category: Omit<IssueCategory, "id">): Promise<IssueCategory> {
    const [row] = await db
      .insert(issueCategories)
      .values({ projectId: category.projectId, name: category.name, assignedToId: category.assignedToId })
      .returning();
    return toDomain(row);
  }
}
