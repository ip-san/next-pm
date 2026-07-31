import { normalizeRelation, type RelationInput } from "@/domain/issue-relation/normalize";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import type { IssueRepository } from "@/domain/issue/repository";

export class InvalidRelationError extends Error {}

export type CreateIssueRelationInput = RelationInput;

/**
 * Mirrors IssueRelation#validate_issue_relation, minus the circular_dependency and
 * ancestor/descendant checks — those require walking the full relation/subtask graph,
 * which is a deliberate simplification for now (same spirit as the adjacency-list-only
 * subtask model noted elsewhere: correctness for the common case, not the full graph).
 */
export async function createIssueRelation(
  repositories: { issueRelationRepository: IssueRelationRepository; issueRepository: IssueRepository },
  input: CreateIssueRelationInput,
): Promise<IssueRelation> {
  if (input.issueFromId === input.issueToId) {
    throw new InvalidRelationError("チケットを自分自身に関連付けることはできません。");
  }

  const [from, to] = await Promise.all([
    repositories.issueRepository.findById(input.issueFromId),
    repositories.issueRepository.findById(input.issueToId),
  ]);
  if (!from || !to) {
    throw new InvalidRelationError("関連付け先のチケットが見つかりません。");
  }
  if (from.projectId !== to.projectId) {
    throw new InvalidRelationError("異なるプロジェクトのチケットは関連付けられません。");
  }

  const normalized = normalizeRelation(input);
  const existing = await repositories.issueRelationRepository.listForIssue(normalized.issueFromId);
  const isDuplicate = existing.some(
    (relation) => relation.issueFromId === normalized.issueFromId && relation.issueToId === normalized.issueToId,
  );
  if (isDuplicate) {
    throw new InvalidRelationError("この関連は既に登録されています。");
  }

  return repositories.issueRelationRepository.create(normalized);
}

export function otherIssueId(relation: IssueRelation, issueId: string): string {
  return relation.issueFromId === issueId ? relation.issueToId : relation.issueFromId;
}

/** The relation-type label to show *from the perspective of* `issueId` (the sym/reverse form when issueId is the "to" side). */
export function relationLabelFor(relation: IssueRelation, issueId: string): string {
  if (relation.issueFromId === issueId) {
    return relation.relationType;
  }
  const REVERSE_LABEL: Record<IssueRelation["relationType"], string> = {
    relates: "relates",
    duplicates: "duplicated",
    blocks: "blocked",
    precedes: "follows",
    copied_to: "copied_from",
  };
  return REVERSE_LABEL[relation.relationType];
}
