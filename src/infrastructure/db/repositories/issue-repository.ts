import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { StaleIssueError, type Issue } from "@/domain/issue/entity";
import type { IssueRepository, IssueUpdate } from "@/domain/issue/repository";
import type { CompiledPredicate } from "@/domain/query/filter-builder";
import { toDrizzleCondition } from "./compile-predicate";

const ISSUE_FILTER_COLUMNS = {
  status_id: issues.statusId,
  tracker_id: issues.trackerId,
  priority_id: issues.priorityId,
  assigned_to_id: issues.assignedToId,
  subject: issues.subject,
};

function toDomain(row: typeof issues.$inferSelect): Issue {
  return {
    id: row.id,
    projectId: row.projectId,
    trackerId: row.trackerId,
    statusId: row.statusId,
    priorityId: row.priorityId,
    subject: row.subject,
    description: row.description,
    authorId: row.authorId,
    assignedToId: row.assignedToId,
    parentId: row.parentId,
    fixedVersionId: row.fixedVersionId,
    categoryId: row.categoryId,
    isPrivate: row.isPrivate,
    doneRatio: row.doneRatio,
    estimatedHours: row.estimatedHours,
    startDate: row.startDate,
    dueDate: row.dueDate,
    lockVersion: row.lockVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleIssueRepository implements IssueRepository {
  async findById(id: string): Promise<Issue | null> {
    const [row] = await db.select().from(issues).where(eq(issues.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async listByProject(projectId: string, predicates: CompiledPredicate[] = []): Promise<Issue[]> {
    const extraCondition = toDrizzleCondition(predicates, ISSUE_FILTER_COLUMNS);
    const condition = extraCondition ? and(eq(issues.projectId, projectId), extraCondition) : eq(issues.projectId, projectId);
    const rows = await db.select().from(issues).where(condition).orderBy(issues.createdAt);
    return rows.map(toDomain);
  }

  async findByAssignee(userId: string): Promise<Issue[]> {
    const rows = await db.select().from(issues).where(eq(issues.assignedToId, userId)).orderBy(desc(issues.createdAt));
    return rows.map(toDomain);
  }

  async findByAuthor(userId: string): Promise<Issue[]> {
    const rows = await db.select().from(issues).where(eq(issues.authorId, userId)).orderBy(desc(issues.createdAt));
    return rows.map(toDomain);
  }

  async findByIds(ids: string[]): Promise<Issue[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(issues).where(inArray(issues.id, ids));
    return rows.map(toDomain);
  }

  async create(issue: Omit<Issue, "id" | "lockVersion" | "createdAt" | "updatedAt">): Promise<Issue> {
    const [row] = await db
      .insert(issues)
      .values({
        projectId: issue.projectId,
        trackerId: issue.trackerId,
        statusId: issue.statusId,
        priorityId: issue.priorityId,
        subject: issue.subject,
        description: issue.description,
        authorId: issue.authorId,
        assignedToId: issue.assignedToId,
        parentId: issue.parentId,
        fixedVersionId: issue.fixedVersionId,
        categoryId: issue.categoryId,
        isPrivate: issue.isPrivate,
        doneRatio: issue.doneRatio,
        estimatedHours: issue.estimatedHours,
        startDate: issue.startDate,
        dueDate: issue.dueDate,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, expectedLockVersion: number, changes: IssueUpdate): Promise<Issue> {
    const [row] = await db
      .update(issues)
      .set({ ...changes, lockVersion: sql`${issues.lockVersion} + 1`, updatedAt: new Date() })
      .where(and(eq(issues.id, id), eq(issues.lockVersion, expectedLockVersion)))
      .returning();

    if (!row) {
      // Mirrors Redmine rescuing StaleObjectError and RecordNotFound alike (issue.rb#L271):
      // either the row moved on to a newer lock_version, or it was deleted underneath us.
      throw new StaleIssueError(id);
    }

    return toDomain(row);
  }

  async search(projectId: string, query: string): Promise<Issue[]> {
    const rows = await db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.projectId, projectId),
          sql`to_tsvector('english', ${issues.subject} || ' ' || ${issues.description}) @@ plainto_tsquery('english', ${query})`,
        ),
      )
      .orderBy(desc(issues.createdAt));
    return rows.map(toDomain);
  }
}
