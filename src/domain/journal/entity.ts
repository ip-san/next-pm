export interface JournalDetail {
  /** "attachment" carries the attachment id in fieldName and its filename in old/newValue. */
  property: "attr" | "cf" | "relation" | "attachment";
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface Journal {
  id: string;
  /** Polymorphic target — Phase 3a only ever writes "Issue" (sheet's CustomValue caveat applies here too). */
  journalizedType: "Issue";
  journalizedId: string;
  userId: string;
  notes: string;
  /**
   * Redmine's private_notes: the note body is visible only to its author and to users with
   * `view_private_notes` on the project. A journal is never half-private — see
   * `splitPrivateNote`, which keeps attribute changes in a separate public journal.
   */
  privateNotes: boolean;
  details: JournalDetail[];
  createdAt: Date;
  /** Equal to createdAt until the note is edited (Redmine backfills updated_on the same way). */
  updatedAt: Date;
  /** Who last edited the note; null while it is still the original. */
  updatedById: string | null;
}
