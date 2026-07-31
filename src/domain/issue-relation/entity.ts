/**
 * Only these five are ever persisted (redmine/app/models/issue_relation.rb TYPES) — the
 * "reverse" forms (duplicated/blocked/follows/copied_from) are display-only labels
 * computed from the other side of a canonical row, never stored themselves.
 */
export type RelationType = "relates" | "duplicates" | "blocks" | "precedes" | "copied_to";

/** Non-canonical input forms accepted from a user picking "is duplicated by", etc. */
export type RelationTypeInput =
  | RelationType
  | "duplicated"
  | "blocked"
  | "follows"
  | "copied_from";

export interface IssueRelation {
  id: string;
  issueFromId: string;
  issueToId: string;
  relationType: RelationType;
  delay: number | null;
}
