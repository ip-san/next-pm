import { NextResponse } from "next/server";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { encodeCsv } from "@/domain/csv/encode";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { loadGlobalIssueLookups, resolveGlobalIssueListScope } from "@/interface/http/global-issue-list";
import { issueColumnValue } from "@/interface/query/issue-list-view";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";

export const dynamic = "force-dynamic";

/**
 * `IssuesController#index.csv` without a project. Same URL contract and same use case as
 * `/issues`, so the export always matches what the page showed — columns, filters, sort and
 * the per-project visibility alike. Capped by `Setting.issues_export_limit` rather than
 * paginated, as Redmine does.
 */
export async function GET(request: Request) {
  const listParams = parseIssueListParams(normalizeSearchParams(new URL(request.url).searchParams));

  const user = await currentUserFromCookies();
  const scope = await resolveGlobalIssueListScope(user);
  if (scope.projects.length === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    const candidate = await new DrizzleQueryRepository().findById(listParams.queryId);
    // A global list may only apply a global query, and only one this actor can see.
    if (candidate && candidate.projectId === null && (user?.isAdmin || isQueryVisible(candidate, user?.id ?? "", scope.roleIds))) {
      savedQuery = candidate;
    }
  }

  const settingsRepository = new DrizzleSettingsRepository();
  const settings = await loadGeneralSettings(settingsRepository);
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
      exportLimit: settings.issuesExportLimit,
    },
  );

  const lookups = await loadGlobalIssueLookups(scope.projects);
  const rowContext = { lookups, customValues: result.search.customValues, spentHours: result.search.spentHours, fullIds: true };

  const rows = [
    result.displayColumns.map((column) => column.label),
    ...result.search.issues.map((issue) => result.displayColumns.map((column) => issueColumnValue(column, issue, rowContext))),
  ];

  return new NextResponse(encodeCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      'Content-Disposition': 'attachment; filename="issues.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
