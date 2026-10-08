import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import type { CustomFieldViewer } from "@/domain/custom-field/visibility";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import type { ProjectIssueScope } from "@/domain/query/issue-search";
import { seesOnlyOwnTimeEntries } from "@/domain/time-entry/visibility";
import type { User } from "@/domain/user/entity";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { issuesVisibilityRoles, listVisibleProjectContexts, type VisibleProjectContext } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";
import type { IssueListLookups } from "@/interface/query/issue-list-view";

export interface GlobalIssueListScope {
  /** Every project the viewer holds `view_issues` in, with its actor already resolved. */
  projects: VisibleProjectContext[];
  /** The per-project rules the issue read model needs. */
  projectScopes: ProjectIssueScope[];
  /** One custom-field viewer per project the viewer holds view_issues in. */
  customFieldViewers: CustomFieldViewer[];
  /** Redmine's `allowed_to?(:view_time_entries, nil, :global => true)` — the gate on the `spent_hours` column. */
  canViewTimeEntries: boolean;
  /** Redmine's `allowed_to?(:save_queries, nil, :global => true)`. */
  canSaveQueries: boolean;
  /** The viewer's groups, for the private-issue rule. Not project-dependent, unlike everything else here. */
  userGroupIds: string[];
  /** The union of the viewer's role ids across visible projects — what "holds this role" means on a page spanning all of them. */
  roleIds: string[];
}

/**
 * The cross-project equivalent of a project page's `resolveActor` + `can` + scope building,
 * mirroring `Issue.visible_condition(user)` with no project: one disjunct per project the
 * viewer may see issues in, each carrying that project's own `issues_visibility` and
 * `time_entries_visibility` verdicts. Shared by the global list page, its exports and its
 * feed so none of them can end up with a different idea of what the viewer may see.
 */
export async function resolveGlobalIssueListScope(user: User | null): Promise<GlobalIssueListScope> {
  const projects = await listVisibleProjectContexts(user, "view_issues");

  const projectScopes: ProjectIssueScope[] = projects.map((entry) => ({
    projectId: entry.project.id,
    seesAllPrivateIssues: issuesVisibilityRoles(entry.actor).some((role) => role.issuesVisibility === "all"),
    spentHours: !can({ permission: "view_time_entries", project: entry.projectContext, actor: entry.actor })
      ? "none"
      : seesOnlyOwnTimeEntries(timeEntriesVisibilityRoles(entry.actor))
        ? "own"
        : "all",
  }));

  return {
    projects,
    projectScopes,
    customFieldViewers: projects.map((entry) => customFieldViewerFor(user, entry.roleIds)),
    canViewTimeEntries: projectScopes.some((scope) => scope.spentHours !== "none"),
    canSaveQueries:
      (user?.isAdmin ?? false) || projects.some((entry) => can({ permission: "save_queries", project: entry.projectContext, actor: entry.actor })),
    userGroupIds: user ? await new DrizzleGroupRepository().listGroupIdsForUser(user.id) : [],
    roleIds: [...new Set(projects.flatMap((entry) => entry.roleIds))],
  };
}

/**
 * Id -> name maps for every association the cross-project list renders, gathered over the
 * visible projects only: a category or version name from a project the viewer can't see
 * must not surface through a column or a filter dropdown. Categories, versions and members
 * are per-project, so they're collected project by project rather than read table-wide.
 */
export async function loadGlobalIssueLookups(projects: VisibleProjectContext[]): Promise<IssueListLookups> {
  const projectIds = projects.map((entry) => entry.project.id);
  const categoryRepository = new DrizzleIssueCategoryRepository();
  const versionRepository = new DrizzleVersionRepository();
  const memberRepository = new DrizzleMemberRepository();

  const [statuses, trackers, priorities, allGroups, categoryLists, versionLists, memberLists] = await Promise.all([
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleGroupRepository().listAll(),
    Promise.all(projectIds.map((id) => categoryRepository.listByProject(id))),
    Promise.all(projectIds.map((id) => versionRepository.listByProject(id))),
    Promise.all(projectIds.map((id) => memberRepository.listByProject(id))),
  ]);

  const users = await new DrizzleUserRepository().findByIds([...new Set(memberLists.flatMap((members) => memberUserIds(members)))]);

  return {
    statuses: new Map(statuses.map((status) => [status.id, status.name])),
    trackers: new Map(trackers.map((tracker) => [tracker.id, tracker.name])),
    priorities: new Map(priorities.map((priority) => [priority.id, priority.name])),
    users: new Map(users.map((user) => [user.id, `${user.lastname} ${user.firstname}`])),
    groups: new Map(allGroups.map((group) => [group.id, group.name])),
    categories: new Map(categoryLists.flat().map((category) => [category.id, category.name])),
    versions: new Map(versionLists.flat().map((version) => [version.id, version.name])),
    projects: new Map(projects.map((entry) => [entry.project.id, entry.project.name])),
  };
}
