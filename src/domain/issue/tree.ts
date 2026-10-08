/**
 * Faithful port of Redmine's `issue_list` helper (`app/helpers/issues_helper.rb`), which
 * turns an ordered list of issues into indentation levels by walking it with an ancestor
 * stack: pop until the current issue is a descendant of the stack top, the level is the
 * stack's depth, and push the issue unless it is a leaf.
 *
 * Indentation is relative to what is *in the list*, exactly as in Redmine — an issue whose
 * parent was filtered out, sorted elsewhere or left on another page sits at level 0 rather
 * than pretending to a depth the reader can't see. For the same reason `parentIdById` only
 * needs the listed issues: a chain that leaves the list ends there.
 */
export function issueIndentLevels(
  orderedIssues: readonly { id: string; parentId: string | null }[],
  parentIdById: ReadonlyMap<string, string | null>,
): Map<string, number> {
  const hasChildInList = new Set(
    orderedIssues.flatMap((issue) => (issue.parentId && parentIdById.has(issue.parentId) ? [issue.parentId] : [])),
  );

  const levels = new Map<string, number>();
  const ancestors: string[] = [];

  for (const issue of orderedIssues) {
    while (ancestors.length > 0 && !isDescendantOf(issue.id, ancestors[ancestors.length - 1], parentIdById)) {
      ancestors.pop();
    }
    levels.set(issue.id, ancestors.length);
    // `ancestors << issue unless issue.leaf?` — only an issue that actually has a child in
    // this list can indent anything below it.
    if (hasChildInList.has(issue.id)) ancestors.push(issue.id);
  }

  return levels;
}

function isDescendantOf(issueId: string, ancestorId: string, parentIdById: ReadonlyMap<string, string | null>): boolean {
  const seen = new Set<string>([issueId]);
  let current = parentIdById.get(issueId) ?? null;
  while (current) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false; // a cycle in stored data must not spin here
    seen.add(current);
    current = parentIdById.get(current) ?? null;
  }
  return false;
}
