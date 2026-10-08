import { NextResponse } from "next/server";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import { buildAtomFeed } from "@/domain/atom/build-feed";
import type { SavedQuery } from "@/domain/query/entity";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { atomResponse, resolveAtomUser } from "@/interface/http/atom-feed";
import { loadGlobalIssueLookups, resolveGlobalIssueListScope } from "@/interface/http/global-issue-list";
import { issueFeedEntries } from "@/interface/http/issue-feed";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";

export const dynamic = "force-dynamic";

/**
 * `IssuesController#index.atom` without a project: the current query's issues as a feed,
 * capped at `Setting.feeds_limit` instead of paginated.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const listParams = parseIssueListParams(normalizeSearchParams(url.searchParams));

  const user = await resolveAtomUser(url);
  const scope = await resolveGlobalIssueListScope(user);
  if (scope.projects.length === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    const candidate = await new DrizzleQueryRepository().findById(listParams.queryId);
    if (candidate && candidate.projectId === null && (user?.isAdmin || isQueryVisible(candidate, user?.id ?? "", scope.roleIds))) {
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
      projectId: null,
      projectScopes: scope.projectScopes,
      customFieldViewers: scope.customFieldViewers,
      params: listParams,
      savedQuery,
      visibility: { userId: user?.id ?? null, userGroupIds: scope.userGroupIds, seesAllPrivateIssues: false },
      canViewTimeEntries: scope.canViewTimeEntries,
      spentHoursScope: { kind: "own", userId: user?.id ?? null },
      today: new Date().toISOString().slice(0, 10),
      exportLimit: feedsLimit,
    },
  );

  const lookups = await loadGlobalIssueLookups(scope.projects);
  const identifierById = new Map(scope.projects.map((entry) => [entry.project.id, entry.project.identifier]));

  const xml = buildAtomFeed(
    { id: `${url.origin}/issues`, title: `next-pm - チケット`, selfUrl: url.toString() },
    issueFeedEntries(result.search.issues, lookups, url.origin, (issue) => `/projects/${identifierById.get(issue.projectId) ?? ""}/issues/${issue.id}`),
  );

  return atomResponse(xml);
}
