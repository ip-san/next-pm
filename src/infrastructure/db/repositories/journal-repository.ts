import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { journalDetails, journals } from "@/infrastructure/db/schema/journals";
import type { Journal } from "@/domain/journal/entity";
import type { JournalRepository } from "@/domain/journal/repository";

export class DrizzleJournalRepository implements JournalRepository {
  async listForIssue(issueId: string): Promise<Journal[]> {
    const rows = await db
      .select()
      .from(journals)
      .where(and(eq(journals.journalizedType, "Issue"), eq(journals.journalizedId, issueId)))
      .orderBy(journals.createdAt);

    const result: Journal[] = [];
    for (const row of rows) {
      const details = await db.select().from(journalDetails).where(eq(journalDetails.journalId, row.id));
      result.push({
        id: row.id,
        journalizedType: "Issue",
        journalizedId: row.journalizedId,
        userId: row.userId,
        notes: row.notes,
        details: details.map((d) => ({
          property: d.property,
          fieldName: d.fieldName,
          oldValue: d.oldValue,
          newValue: d.newValue,
        })),
        createdAt: row.createdAt,
      });
    }
    return result;
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
