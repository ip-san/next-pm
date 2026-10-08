import { can } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { ProjectIssueScope } from "@/domain/query/issue-search";
import { seesOnlyOwnTimeEntries } from "@/domain/time-entry/visibility";
import type { User } from "@/domain/user/entity";
import { issuesVisibilityRoles, listVisibleProjectContexts } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";

/**
 * The issue scope of a project and its subprojects, for display_subprojects_issues. Each project in the
 * nested-set subtree contributes its own private-issue and time-entry verdicts (the same rule the
 * cross-project list uses), so a subproject the viewer can't see issues in contributes nothing. The
 * project itself is in its own subtree.
 */
export async function subprojectIssueScope(
  user: User | null,
  project: Pick<Project, "lft" | "rgt">,
): Promise<{ projectScopes: ProjectIssueScope[]; identifierByProjectId: Map<string, string> }> {
  const contexts = (await listVisibleProjectContexts(user, "view_issues")).filter(
    (entry) => entry.project.lft >= project.lft && entry.project.rgt <= project.rgt,
  );

  const projectScopes: ProjectIssueScope[] = contexts.map((entry) => ({
    projectId: entry.project.id,
    seesAllPrivateIssues: issuesVisibilityRoles(entry.actor).some((role) => role.issuesVisibility === "all"),
    spentHours: !can({ permission: "view_time_entries", project: entry.projectContext, actor: entry.actor })
      ? "none"
      : seesOnlyOwnTimeEntries(timeEntriesVisibilityRoles(entry.actor))
        ? "own"
        : "all",
  }));

  return {
    projectScopes,
    identifierByProjectId: new Map(contexts.map((entry) => [entry.project.id, entry.project.identifier])),
  };
}
