import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import type { ProjectTimeEntryScope, TimeEntryVisibilityScope } from "@/domain/query/time-entry-search";
import { seesOnlyOwnTimeEntries } from "@/domain/time-entry/visibility";
import type { User } from "@/domain/user/entity";
import { loadProjectActivities } from "@/application/time-entries/project-activities";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { issuesVisibilityRoles, listVisibleProjectContexts, type VisibleProjectContext } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";
import type { TimeEntryListLookups } from "@/interface/query/time-entry-list-view";

/** The per-project rules behind one time-entry list, for one project or for all of them. */
export function timeEntryProjectScope(entry: VisibleProjectContext): ProjectTimeEntryScope {
  const canViewTimeEntries = can({ permission: "view_time_entries", project: entry.projectContext, actor: entry.actor });
  const canViewIssues = can({ permission: "view_issues", project: entry.projectContext, actor: entry.actor });
  return {
    projectId: entry.project.id,
    timeEntries: !canViewTimeEntries ? "none" : seesOnlyOwnTimeEntries(timeEntriesVisibilityRoles(entry.actor)) ? "own" : "all",
    issues: !canViewIssues
      ? "none"
      : issuesVisibilityRoles(entry.actor).some((role) => role.issuesVisibility === "all")
        ? "all"
        : "visible_only",
  };
}

export interface TimeEntryListScope {
  projects: VisibleProjectContext[];
  visibility: TimeEntryVisibilityScope;
  /** Redmine's `allowed_to?(:save_queries, nil, :global => true)`. */
  canSaveQueries: boolean;
  /** The union of the viewer's role ids across visible projects, for saved-query visibility. */
  roleIds: string[];
}

/**
 * `TimelogController#index` without a project: every project the viewer holds
 * `view_time_entries` in, each contributing its own `TimeEntry.visible_condition` verdict
 * and its own issue-visibility verdict.
 */
export async function resolveGlobalTimeEntryScope(user: User | null): Promise<TimeEntryListScope> {
  const projects = await listVisibleProjectContexts(user, "view_time_entries");
  const userGroupIds = user ? await new DrizzleGroupRepository().listGroupIdsForUser(user.id) : [];

  return {
    projects,
    visibility: { userId: user?.id ?? null, userGroupIds, projects: projects.map(timeEntryProjectScope) },
    canSaveQueries:
      (user?.isAdmin ?? false) || projects.some((entry) => can({ permission: "save_queries", project: entry.projectContext, actor: entry.actor })),
    roleIds: [...new Set(projects.flatMap((entry) => entry.roleIds))],
  };
}

/**
 * Id -> name maps for the columns a time-entry list renders. Issue subjects are looked up
 * only for the entries actually on the page — the alternative is loading every issue in
 * every visible project to render one column.
 */
export async function loadTimeEntryLookups(
  projects: VisibleProjectContext[],
  rows: { issueIds: string[]; userIds: string[] },
): Promise<TimeEntryListLookups> {
  const memberRepository = new DrizzleMemberRepository();
  // Per project, not the system list alone: an entry recorded before a project deactivated an
  // activity still has to show that activity's name, and that row may be a project override.
  const [activityViews, memberLists, issues] = await Promise.all([
    Promise.all(
      projects.map((entry) =>
        loadProjectActivities(
          { enumerationRepository: new DrizzleEnumerationRepository(), projectActivityRepository: new DrizzleProjectActivityRepository() },
          entry.project.id,
        ),
      ),
    ),
    Promise.all(projects.map((entry) => memberRepository.listByProject(entry.project.id))),
    rows.issueIds.length > 0 ? new DrizzleIssueRepository().findByIds(rows.issueIds) : Promise.resolve([]),
  ]);

  // An entry's user or author may be someone who has since left the project, so the member
  // list alone can't label every row — the rows' own ids go into the lookup as well.
  const users = await new DrizzleUserRepository().findByIds([
    ...new Set([...memberLists.flatMap((members) => memberUserIds(members)), ...rows.userIds]),
  ]);

  return {
    projects: new Map(projects.map((entry) => [entry.project.id, entry.project.name])),
    users: new Map(users.map((user) => [user.id, `${user.lastname} ${user.firstname}`])),
    activities: new Map(
      activityViews.flatMap((view) => [...view.byId].map(([id, activity]) => [id, activity.name] as const)),
    ),
    issues: new Map(issues.map((issue) => [issue.id, issue.subject])),
  };
}
