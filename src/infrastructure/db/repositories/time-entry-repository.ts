import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { timeEntries } from "@/infrastructure/db/schema/time-entries";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository, TimeEntryUpdate } from "@/domain/time-entry/repository";

function toDomain(row: typeof timeEntries.$inferSelect): TimeEntry {
  return {
    id: row.id,
    projectId: row.projectId,
    issueId: row.issueId,
    userId: row.userId,
    authorId: row.authorId,
    activityId: row.activityId,
    hours: row.hours,
    comments: row.comments,
    spentOn: row.spentOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleTimeEntryRepository implements TimeEntryRepository {
  async listForProject(projectId: string): Promise<TimeEntry[]> {
    const rows = await db.select().from(timeEntries).where(eq(timeEntries.projectId, projectId)).orderBy(timeEntries.spentOn);
    return rows.map(toDomain);
  }

  async listForIssue(issueId: string): Promise<TimeEntry[]> {
    const rows = await db.select().from(timeEntries).where(eq(timeEntries.issueId, issueId)).orderBy(timeEntries.spentOn);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<TimeEntry | null> {
    const [row] = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(entry: Omit<TimeEntry, "id" | "createdAt" | "updatedAt">): Promise<TimeEntry> {
    const [row] = await db
      .insert(timeEntries)
      .values({
        projectId: entry.projectId,
        issueId: entry.issueId,
        userId: entry.userId,
        authorId: entry.authorId,
        activityId: entry.activityId,
        hours: entry.hours,
        comments: entry.comments,
        spentOn: entry.spentOn,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, changes: TimeEntryUpdate): Promise<TimeEntry> {
    const [row] = await db
      .update(timeEntries)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(timeEntries.id, id))
      .returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async reassignProjectForIssues(issueIds: string[], projectId: string): Promise<void> {
    if (issueIds.length === 0) return;
    await db.update(timeEntries).set({ projectId }).where(inArray(timeEntries.issueId, issueIds));
  }

  async listForIssues(issueIds: string[]): Promise<TimeEntry[]> {
    if (issueIds.length === 0) return [];
    const rows = await db.select().from(timeEntries).where(inArray(timeEntries.issueId, issueIds));
    return rows.map(toDomain);
  }

  async deleteForIssues(issueIds: string[]): Promise<void> {
    if (issueIds.length === 0) return;
    await db.delete(timeEntries).where(inArray(timeEntries.issueId, issueIds));
  }

  async detachFromIssues(issueIds: string[]): Promise<void> {
    if (issueIds.length === 0) return;
    await db.update(timeEntries).set({ issueId: null }).where(inArray(timeEntries.issueId, issueIds));
  }

  async reassignToIssue(issueIds: string[], targetIssueId: string, targetProjectId: string): Promise<void> {
    if (issueIds.length === 0) return;
    await db
      .update(timeEntries)
      .set({ issueId: targetIssueId, projectId: targetProjectId })
      .where(inArray(timeEntries.issueId, issueIds));
  }
}
