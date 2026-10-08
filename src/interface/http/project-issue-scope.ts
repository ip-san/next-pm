import { can } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { Project } from "@/domain/project/entity";
import type { ProjectIssueScope } from "@/domain/query/issue-search";
import { seesOnlyOwnTimeEntries } from "@/domain/time-entry/visibility";
import type { User } from "@/domain/user/entity";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
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

/**
 * The project-scoped issue list's `projectScopes`, when display_subprojects_issues is on; nothing (the
 * project alone) when it is off. The exports use this so they match the list on screen.
 */
export async function projectIssueListScopeFor(
  user: User | null,
  project: Pick<Project, "lft" | "rgt">,
): Promise<{ projectScopes?: ProjectIssueScope[] }> {
  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  if (!displaySubprojectsIssues) return {};
  return { projectScopes: (await subprojectIssueScope(user, project)).projectScopes };
}

/**
 * The issues of a project's subtree the viewer may see, each project's issues judged with that project's
 * own actor and groups. For screens that list the issues themselves (the Gantt chart), where the scope
 * alone isn't enough.
 */
export async function subtreeVisibleIssues(
  user: User | null,
  project: Pick<Project, "lft" | "rgt">,
): Promise<{ issues: Issue[]; identifierByProjectId: Map<string, string> }> {
  const contexts = (await listVisibleProjectContexts(user, "view_issues")).filter(
    (entry) => entry.project.lft >= project.lft && entry.project.rgt <= project.rgt,
  );
  const issueRepository = new DrizzleIssueRepository();
  const perProject = await Promise.all(
    contexts.map(async (entry) => {
      const issues = await issueRepository.listByProject(entry.project.id);
      const roles = issuesVisibilityRoles(entry.actor);
      return issues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, entry.userGroupIds, roles));
    }),
  );
  return {
    issues: perProject.flat(),
    identifierByProjectId: new Map(contexts.map((entry) => [entry.project.id, entry.project.identifier])),
  };
}
