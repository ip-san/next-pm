/**
 * Mirrors the self/descendant half of Redmine's `Issue#validate_parent_issue`
 * (`app/models/issue.rb`): an issue may not be its own parent, nor be re-parented under
 * one of its own descendants — either would detach the subtree from the root and make the
 * parent chain loop forever.
 *
 * Takes the project's whole parent map rather than a repository so the check stays pure;
 * the same-project rule enforced by the callers guarantees the chain never leaves the map.
 * A chain that walks off the map (an invisible or cross-project ancestor) simply ends —
 * it can't be the issue being re-parented, so it isn't a cycle.
 */
export function wouldCreateParentCycle(
  issueId: string,
  newParentId: string,
  parentIdById: ReadonlyMap<string, string | null>,
): boolean {
  if (newParentId === issueId) return true;

  const seen = new Set<string>([newParentId]);
  let ancestorId = parentIdById.get(newParentId) ?? null;
  while (ancestorId) {
    if (ancestorId === issueId) return true;
    if (seen.has(ancestorId)) return true; // pre-existing loop in the data — don't spin on it
    seen.add(ancestorId);
    ancestorId = parentIdById.get(ancestorId) ?? null;
  }
  return false;
}

/**
 * The issue plus every descendant of it, parents before children. Redmine deletes and moves
 * a subtree as a unit (`Issue.self_and_descendants`), and `issues.parent_id` is
 * ON DELETE SET NULL here, so the set has to be collected explicitly rather than left to
 * the database. `seen` also guards against a cycle left behind by older data.
 */
export function collectSelfAndDescendantIds(rootId: string, parentIdById: ReadonlyMap<string, string | null>): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const [id, parentId] of parentIdById) {
    if (!parentId) continue;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), id]);
  }

  const ordered: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>([rootId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const childId of childrenByParent.get(current) ?? []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      queue.push(childId);
    }
  }
  return ordered;
}
