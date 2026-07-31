import type { RelationType, RelationTypeInput } from "./entity";

/** Maps each non-canonical input type to its canonical counterpart, per TYPES[x][:reverse]. */
const REVERSE_OF: Partial<Record<RelationTypeInput, RelationType>> = {
  duplicated: "duplicates",
  blocked: "blocks",
  follows: "precedes",
  copied_from: "copied_to",
};

export interface RelationInput {
  issueFromId: string;
  issueToId: string;
  relationType: RelationTypeInput;
  delay: number | null;
}

export interface NormalizedRelation {
  issueFromId: string;
  issueToId: string;
  relationType: RelationType;
  delay: number | null;
}

/**
 * Faithful port of IssueRelation#reverse_if_needed + #handle_issue_order: reverse-form
 * inputs get their issue_from/issue_to swapped and are rewritten to the canonical type;
 * "relates" additionally gets its pair ordered so (A relates B) and (B relates A) collapse
 * to the same stored row (Redmine compares numeric ids — we use string comparison, which
 * is a stable total order for uuids and preserves the "collapse to one canonical row"
 * property even though the ordering itself isn't numeric).
 */
export function normalizeRelation(input: RelationInput): NormalizedRelation {
  const reverseType = REVERSE_OF[input.relationType];
  if (reverseType) {
    return {
      issueFromId: input.issueToId,
      issueToId: input.issueFromId,
      relationType: reverseType,
      delay: reverseType === "precedes" ? input.delay ?? 0 : null,
    };
  }

  const relationType = input.relationType as RelationType;
  if (relationType === "relates" && input.issueFromId > input.issueToId) {
    return {
      issueFromId: input.issueToId,
      issueToId: input.issueFromId,
      relationType,
      delay: null,
    };
  }

  return {
    issueFromId: input.issueFromId,
    issueToId: input.issueToId,
    relationType,
    delay: relationType === "precedes" ? input.delay ?? 0 : null,
  };
}
