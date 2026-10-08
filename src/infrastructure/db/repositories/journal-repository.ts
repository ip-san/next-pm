import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { journalDetails, journals } from "@/infrastructure/db/schema/journals";
import { reactions } from "@/infrastructure/db/schema/reactions";
import type { Journal } from "@/domain/journal/entity";
import type { JournalRepository } from "@/domain/journal/repository";
import type { JournalViewer } from "@/domain/journal/visibility";

/**
 * SQL form of `isJournalVisible` / Redmine's visible_notes_condition, applied in the query
 * so a private note never reaches the application layer in the first place. The predicate
 * is duplicated from the domain rule on purpose — filtering in memory would mean paging and
 * counting over rows the viewer can't have.
 */
function visibleNotesCondition(viewer: JournalViewer): SQL | undefined {
  if (viewer.canViewPrivateNotes) return undefined;
  const isPublic = eq(journals.privateNotes, false);
  return viewer.userId === null ? isPublic : or(isPublic, eq(journals.userId, viewer.userId));
}

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
    privateNotes: row.privateNotes,
    details: (detailsByJournalId.get(row.id) ?? []).map((d) => ({
      property: d.property,
      fieldName: d.fieldName,
      oldValue: d.oldValue,
      newValue: d.newValue,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
  }));
}

export class DrizzleJournalRepository implements JournalRepository {
  async findById(id: string, viewer: JournalViewer): Promise<Journal | null> {
    const [row] = await db
      .select()
      .from(journals)
      .where(and(eq(journals.id, id), visibleNotesCondition(viewer)))
      .limit(1);
    if (!row) return null;
    const [journal] = await withDetails([row]);
    return journal;
  }

  /** Ids of the issues `userId` has journalled — Redmine's `updated_by` filter. */
  async listIssueIdsJournaledBy(userId: string): Promise<string[]> {
    const rows = await db
      .select({ journalizedId: journals.journalizedId })
      .from(journals)
      .where(and(eq(journals.journalizedType, "Issue"), eq(journals.userId, userId)));
    return [...new Set(rows.map((row) => row.journalizedId))];
  }

  async listForIssue(issueId: string, viewer: JournalViewer): Promise<Journal[]> {
    const rows = await db
      .select()
      .from(journals)
      .where(and(eq(journals.journalizedType, "Issue"), eq(journals.journalizedId, issueId), visibleNotesCondition(viewer)))
      .orderBy(journals.createdAt);
    return withDetails(rows);
  }

  async listByProject(projectId: string, viewer: JournalViewer): Promise<Journal[]> {
    const rows = await db
      .select({ journal: journals })
      .from(journals)
      .innerJoin(issues, eq(issues.id, journals.journalizedId))
      .where(and(eq(journals.journalizedType, "Issue"), eq(issues.projectId, projectId), visibleNotesCondition(viewer)))
      .orderBy(journals.createdAt);
    return withDetails(rows.map((r) => r.journal));
  }

  async create(journal: Omit<Journal, "id" | "createdAt" | "updatedAt" | "updatedById">): Promise<Journal> {
    const [row] = await db
      .insert(journals)
      .values({
        journalizedType: journal.journalizedType,
        journalizedId: journal.journalizedId,
        userId: journal.userId,
        notes: journal.notes,
        privateNotes: journal.privateNotes,
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
      privateNotes: row.privateNotes,
      details: journal.details,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    };
  }

  async update(id: string, changes: { notes: string; privateNotes: boolean; updatedById: string }): Promise<Journal> {
    const [row] = await db
      .update(journals)
      .set({ notes: changes.notes, privateNotes: changes.privateNotes, updatedAt: new Date(), updatedById: changes.updatedById })
      .where(eq(journals.id, id))
      .returning();
    const [journal] = await withDetails([row]);
    return journal;
  }

  async delete(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Reactions point at journals polymorphically, so they have to go explicitly.
      await tx.delete(reactions).where(and(eq(reactions.reactableType, "Journal"), eq(reactions.reactableId, id)));
      // journal_details cascades from journals in the schema.
      await tx.delete(journals).where(eq(journals.id, id));
    });
  }
}
