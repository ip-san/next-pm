import { NextResponse } from "next/server";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { can } from "@/domain/authorization/authorization-service";
import { encodeCsv } from "@/domain/csv/encode";
import { memberUserIds } from "@/domain/member/entity";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issueVisibilityScope, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { spentHoursScopeFor } from "@/interface/http/time-entry-access";
import { issueColumnValue, type IssueListLookups } from "@/interface/query/issue-list-view";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";

export const dynamic = "force-dynamic";

// Cookie-authed download endpoint, same pattern as /api/attachments/[id] — outside
// /api/v1 since this serves the HTML issues list's "CSV" link, not the Bearer/Basic
// REST API surface. It reads the exact same URL contract as the list page and runs the
// same use case, so the export always matches what's on screen — including the chosen
// columns, filters and sort. Like Redmine it exports the whole filtered set rather than
// the current page, capped by `Setting.issues_export_limit`.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const listParams = parseIssueListParams(normalizeSearchParams(new URL(request.url).searchParams));

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_issues", project: projectContext, actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const settingsRepository = new DrizzleSettingsRepository();
  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    const candidate = await new DrizzleQueryRepository().findById(listParams.queryId);
    if (candidate && candidate.projectId === project.id && isQueryVisible(candidate, user?.id ?? "", roleIds)) {
      savedQuery = candidate;
    }
  }

  const settings = await loadGeneralSettings(settingsRepository);
  const result = await listProjectIssues(
    {
      issueSearchRepository: new DrizzleIssueSearchRepository(),
      issueStatusRepository: new DrizzleIssueStatusRepository(),
      customFieldRepository: new DrizzleCustomFieldRepository(),
      settingsRepository,
    },
    {
      projectId: project.id,
      params: listParams,
      savedQuery,
      visibility: issueVisibilityScope(user?.id ?? null, actor, userGroupIds),
      canViewTimeEntries: can({ permission: "view_time_entries", project: projectContext, actor }),
      spentHoursScope: spentHoursScopeFor(actor, user?.id ?? null),
      today: new Date().toISOString().slice(0, 10),
      exportLimit: settings.issuesExportLimit,
    },
  );

  const [statuses, trackers, priorities, categories, versions, members, allGroups] = await Promise.all([
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listByProject(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleGroupRepository().listAll(),
  ]);
  const memberUsers = await new DrizzleUserRepository().findByIds(memberUserIds(members));

  const lookups: IssueListLookups = {
    statuses: new Map(statuses.map((status) => [status.id, status.name])),
    trackers: new Map(trackers.map((tracker) => [tracker.id, tracker.name])),
    priorities: new Map(priorities.map((priority) => [priority.id, priority.name])),
    users: new Map(memberUsers.map((member) => [member.id, `${member.lastname} ${member.firstname}`])),
    groups: new Map(allGroups.map((group) => [group.id, group.name])),
    categories: new Map(categories.map((category) => [category.id, category.name])),
    versions: new Map(versions.map((version) => [version.id, version.name])),
  };
  const rowContext = { lookups, customValues: result.search.customValues, spentHours: result.search.spentHours, fullIds: true };

  const rows = [
    result.displayColumns.map((column) => column.label),
    ...result.search.issues.map((issue) => result.displayColumns.map((column) => issueColumnValue(column, issue, rowContext))),
  ];

  return new NextResponse(encodeCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="issues-${identifier}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
