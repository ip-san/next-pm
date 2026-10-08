import { isWithinSubtree, type NestedSetNode } from "@/domain/project/nested-set";

/**
 * Which issues a commit in this repository may reference, mirroring Redmine's
 * `Changeset#find_referenced_issue_by_id`:
 *
 * ```ruby
 * if Setting.commit_cross_project_ref?
 *   # all issues can be referenced/fixed
 * elsif issue
 *   unless issue.project &&
 *            (project == issue.project || project.is_ancestor_of?(issue.project) ||
 *             project.is_descendant_of?(issue.project))
 *     issue = nil
 *   end
 * end
 * ```
 *
 * With the setting off, that is the same project, an ancestor or a descendant — **not** a
 * sibling, which is the part that is easy to get wrong. Both directions collapse to a subtree
 * containment test over the nested set, since "ancestor of" is the issue's project sitting
 * inside the repository's subtree and "descendant of" is the reverse.
 *
 * Note this governs *which issue the reference resolves to*, not whether the viewer may see it;
 * the caller still applies issue visibility on top, as `add_related_issue` does.
 */
export function canReferenceIssueProject(
  repositoryProject: NestedSetNode,
  issueProject: NestedSetNode,
  crossProjectRef: boolean,
): boolean {
  if (crossProjectRef) return true;
  return isWithinSubtree(repositoryProject, issueProject) || isWithinSubtree(issueProject, repositoryProject);
}
