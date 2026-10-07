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
  details: JournalDetail[];
  createdAt: Date;
}
