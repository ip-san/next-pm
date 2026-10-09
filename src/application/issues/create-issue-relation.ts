import type { RelationType } from "@/domain/issue-relation/entity";
import { normalizeRelation, type RelationInput } from "@/domain/issue-relation/normalize";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import type { IssueRepository } from "@/domain/issue/repository";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export class InvalidRelationError extends Error {}

export type CreateIssueRelationInput = RelationInput;

/** Mirrors IssueRelation::TYPES that participate in Redmine's circular_dependency check. */
const DEPENDENT_TYPES: RelationType[] = ["blocks", "precedes"];

/**
 * True if `targetId` is reachable from `startId` by following existing "blocks"/"precedes"
 * edges forward (issue_from -> issue_to) — i.e. adding a new startId -> targetId edge of one
 * of those types would close a cycle. Mirrors IssueRelation#validate_issue_relation's
 * circular_dependency check (Issue#all_dependent_issues), restricted to direct relation
 * edges — it does not additionally walk the subtask tree the way Redmine's own
 * all_dependent_issues does.
 */
async function isReachable(issueRelationRepository: IssueRelationRepository, startId: string, targetId: string): Promise<boolean> {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const relations = await issueRelationRepository.listForIssue(current);
    for (const relation of relations) {
      if (relation.issueFromId !== current || !DEPENDENT_TYPES.includes(relation.relationType)) continue;
      if (relation.issueToId === targetId) return true;
      if (!visited.has(relation.issueToId)) {
        visited.add(relation.issueToId);
        queue.push(relation.issueToId);
      }
    }
  }
  return false;
}

/** True if `ancestorId` is a parentId-chain ancestor of `descendantId`. */
async function isAncestorOf(issueRepository: IssueRepository, ancestorId: string, descendantId: string): Promise<boolean> {
  const visited = new Set<string>();
  let currentId: string | null = descendantId;
  while (currentId) {
    const current = await issueRepository.findById(currentId);
    if (!current?.parentId) return false;
    if (current.parentId === ancestorId) return true;
    if (visited.has(current.parentId)) return false;
    visited.add(current.parentId);
    currentId = current.parentId;
  }
  return false;
}

/**
 * Mirrors IssueRelation#validate_issue_relation. The cross-project check mirrors
 * Setting.cross_project_issue_relations.
 */
export async function createIssueRelation(
  repositories: { issueRelationRepository: IssueRelationRepository; issueRepository: IssueRepository; settingsRepository: SettingsRepository },
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
  const { crossProjectIssueRelations } = resolveGeneralSettings(await repositories.settingsRepository.getAll());
  if (from.projectId !== to.projectId && !crossProjectIssueRelations) {
    throw new InvalidRelationError("異なるプロジェクトのチケットは関連付けられません。");
  }

  if ((await isAncestorOf(repositories.issueRepository, from.id, to.id)) || (await isAncestorOf(repositories.issueRepository, to.id, from.id))) {
    throw new InvalidRelationError("親子関係にあるチケット同士は関連付けられません。");
  }

  const normalized = normalizeRelation(input);

  if (DEPENDENT_TYPES.includes(normalized.relationType)) {
    if (await isReachable(repositories.issueRelationRepository, normalized.issueToId, normalized.issueFromId)) {
      throw new InvalidRelationError("循環した関連は作成できません。");
    }
  }

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
/** A relation as read from one side: its own type, or the reverse name seen from the other issue. */
export type RelationLabel = IssueRelation["relationType"] | "duplicated" | "blocked" | "follows" | "copied_from";

export function relationLabelFor(relation: IssueRelation, issueId: string): RelationLabel {
  if (relation.issueFromId === issueId) {
    return relation.relationType;
  }
  const REVERSE_LABEL: Record<IssueRelation["relationType"], RelationLabel> = {
    relates: "relates",
    duplicates: "duplicated",
    blocks: "blocked",
    precedes: "follows",
    copied_to: "copied_from",
  };
  return REVERSE_LABEL[relation.relationType];
}
