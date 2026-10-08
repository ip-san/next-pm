import type { Journal } from "./entity";
import type { JournalViewer } from "./visibility";

export interface JournalRepository {
  /**
   * `viewer` is required rather than optional on purpose: every read of a journal has to
   * decide what to do about private notes, and making the compiler ask is the only way to
   * be sure a new read site doesn't quietly leak them.
   */
  findById(id: string, viewer: JournalViewer): Promise<Journal | null>;
  listForIssue(issueId: string, viewer: JournalViewer): Promise<Journal[]>;
  /** Every journal across every issue in the project — activity feed. */
  listByProject(projectId: string, viewer: JournalViewer): Promise<Journal[]>;
  create(journal: Omit<Journal, "id" | "createdAt" | "updatedAt" | "updatedById">): Promise<Journal>;
  /** Edits the note body and its private flag, stamping who changed it (Redmine's updated_by_id). */
  update(id: string, changes: { notes: string; privateNotes: boolean; updatedById: string }): Promise<Journal>;
  /** Removes the journal and any reactions pointing at it. */
  delete(id: string): Promise<void>;
}
