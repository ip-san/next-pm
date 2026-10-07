import type { Journal } from "./entity";

export interface JournalViewer {
  /** Null for an anonymous visitor, who is never the author of anything. */
  userId: string | null;
  /** Whether the viewer holds `view_private_notes` on the journal's project. */
  canViewPrivateNotes: boolean;
}

/**
 * Faithful port of Redmine's `Journal.visible_notes_condition` (`app/models/journal.rb`):
 *
 *   private_notes = false OR user_id = <viewer> OR <viewer has view_private_notes>
 *
 * The author clause matters — someone who writes a private note keeps seeing it even after
 * losing the permission, which is also why this can't be reduced to a project-level check.
 */
export function isJournalVisible(journal: Pick<Journal, "privateNotes" | "userId">, viewer: JournalViewer): boolean {
  if (!journal.privateNotes) return true;
  if (viewer.userId !== null && journal.userId === viewer.userId) return true;
  return viewer.canViewPrivateNotes;
}

/** Convenience wrapper so read sites filter with one call rather than inlining the predicate. */
export function visibleJournalsFor<J extends Pick<Journal, "privateNotes" | "userId">>(
  journals: J[],
  viewer: JournalViewer,
): J[] {
  return journals.filter((journal) => isJournalVisible(journal, viewer));
}

/**
 * Port of Redmine's `Journal#split_private_notes` (a before_create hook):
 *
 *   - a private note carrying attribute details is split in two, so the details stay public
 *     and only the note body is hidden. Without this, marking a note private would also
 *     hide the status change it accompanied from everyone who can't read private notes.
 *   - a private journal with a blank note isn't private at all — there is nothing to hide,
 *     and leaving the flag on would hide the details for no reason.
 *
 * Returns the journals to create, in order. The public details journal comes first so it
 * reads as "the change, then the comment about it".
 */
export function splitPrivateNote<J extends { notes: string; privateNotes: boolean; details: unknown[] }>(journal: J): J[] {
  if (!journal.privateNotes) return [journal];

  if (journal.notes.trim().length === 0) {
    return [{ ...journal, privateNotes: false }];
  }
  if (journal.details.length === 0) {
    return [journal];
  }
  return [
    { ...journal, notes: "", privateNotes: false },
    { ...journal, details: [] },
  ];
}
