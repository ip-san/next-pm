import { NextResponse } from "next/server";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import { buildAtomFeed } from "@/domain/atom/build-feed";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { atomResponse, resolveAtomUser } from "@/interface/http/atom-feed";
import { issueFeedEntries } from "@/interface/http/issue-feed";
import { issueVisibilityScope, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { spentHoursScopeFor } from "@/interface/http/time-entry-access";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";

export const dynamic = "force-dynamic";

/**
 * `IssuesController#index.atom` for one project: whatever query the URL describes, as a
 * feed. It reads the same `f[]`/`op`/`v`/`query_id` contract as the list page, so the
 * "Atom" link next to a filtered list subscribes to exactly that filtered list.
 */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);
  const listParams = parseIssueListParams(normalizeSearchParams(url.searchParams));

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveAtomUser(url);
  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_issues", project: projectContext, actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    const candidate = await new DrizzleQueryRepository().findById(listParams.queryId);
    // Redmine's `global_or_on_project`: a project list may apply its own queries and the global ones.
    if (
      candidate &&
      (candidate.projectId === null || candidate.projectId === project.id) &&
      isQueryVisible(candidate, user?.id ?? "", roleIds)
    ) {
      savedQuery = candidate;
    }
  }

  const settingsRepository = new DrizzleSettingsRepository();
  const { feedsLimit } = resolveGeneralSettings(await settingsRepository.getAll());
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
      exportLimit: feedsLimit,
    },
  );

  const [trackers, statuses, members] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const memberUsers = await new DrizzleUserRepository().findByIds(memberUserIds(members));

  const lookups = {
    trackers: new Map(trackers.map((tracker) => [tracker.id, tracker.name])),
    statuses: new Map(statuses.map((status) => [status.id, status.name])),
    users: new Map(memberUsers.map((member) => [member.id, `${member.lastname} ${member.firstname}`])),
  };

  const xml = buildAtomFeed(
    { id: `${url.origin}/projects/${identifier}/issues`, title: `${project.name} - チケット`, selfUrl: url.toString() },
    issueFeedEntries(result.search.issues, lookups, url.origin, (issue) => `/projects/${identifier}/issues/${issue.id}`),
  );

  return atomResponse(xml);
}
