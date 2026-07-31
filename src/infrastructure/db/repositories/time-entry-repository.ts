import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { timeEntries } from "@/infrastructure/db/schema/time-entries";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";

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

  async create(entry: Omit<TimeEntry, "id" | "createdAt">): Promise<TimeEntry> {
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
}
