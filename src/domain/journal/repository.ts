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
  create(journal: Omit<Journal, "id" | "createdAt">): Promise<Journal>;
}
