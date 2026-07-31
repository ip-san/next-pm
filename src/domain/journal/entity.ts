export interface JournalDetail {
  property: "attr" | "cf" | "relation";
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
