import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { journalDetails, journals } from "@/infrastructure/db/schema/journals";
import type { Journal } from "@/domain/journal/entity";
import type { JournalRepository } from "@/domain/journal/repository";

async function withDetails(rows: (typeof journals.$inferSelect)[]): Promise<Journal[]> {
  if (rows.length === 0) return [];
  const details = await db
    .select()
    .from(journalDetails)
    .where(
      inArray(
        journalDetails.journalId,
        rows.map((r) => r.id),
      ),
    );
  const detailsByJournalId = new Map<string, typeof journalDetails.$inferSelect[]>();
  for (const d of details) {
    const list = detailsByJournalId.get(d.journalId) ?? [];
    list.push(d);
    detailsByJournalId.set(d.journalId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    journalizedType: "Issue" as const,
    journalizedId: row.journalizedId,
    userId: row.userId,
    notes: row.notes,
    details: (detailsByJournalId.get(row.id) ?? []).map((d) => ({
      property: d.property,
      fieldName: d.fieldName,
      oldValue: d.oldValue,
      newValue: d.newValue,
    })),
    createdAt: row.createdAt,
  }));
}

export class DrizzleJournalRepository implements JournalRepository {
  async listForIssue(issueId: string): Promise<Journal[]> {
    const rows = await db
      .select()
      .from(journals)
      .where(and(eq(journals.journalizedType, "Issue"), eq(journals.journalizedId, issueId)))
      .orderBy(journals.createdAt);
    return withDetails(rows);
  }

  async listByProject(projectId: string): Promise<Journal[]> {
    const rows = await db
      .select({ journal: journals })
      .from(journals)
      .innerJoin(issues, eq(issues.id, journals.journalizedId))
      .where(and(eq(journals.journalizedType, "Issue"), eq(issues.projectId, projectId)))
      .orderBy(journals.createdAt);
    return withDetails(rows.map((r) => r.journal));
  }

  async create(journal: Omit<Journal, "id" | "createdAt">): Promise<Journal> {
    const [row] = await db
      .insert(journals)
      .values({
        journalizedType: journal.journalizedType,
        journalizedId: journal.journalizedId,
        userId: journal.userId,
        notes: journal.notes,
      })
      .returning();

    if (journal.details.length > 0) {
      await db.insert(journalDetails).values(
        journal.details.map((d) => ({
          journalId: row.id,
          property: d.property,
          fieldName: d.fieldName,
          oldValue: d.oldValue,
          newValue: d.newValue,
        })),
      );
    }

    return {
      id: row.id,
      journalizedType: "Issue",
      journalizedId: row.journalizedId,
      userId: row.userId,
      notes: row.notes,
      details: journal.details,
      createdAt: row.createdAt,
    };
  }
}
