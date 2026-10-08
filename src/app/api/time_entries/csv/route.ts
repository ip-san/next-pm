import { NextResponse } from "next/server";
import { listTimeEntries } from "@/application/time-entries/list-time-entries";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { encodeCsv } from "@/domain/csv/encode";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntrySearchRepository } from "@/infrastructure/db/repositories/time-entry-search-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { loadTimeEntryLookups, resolveGlobalTimeEntryScope } from "@/interface/http/time-entry-list";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";
import { timeEntryColumnValue } from "@/interface/query/time-entry-list-view";

export const dynamic = "force-dynamic";

/**
 * `TimelogController#index.csv` without a project. Reads the same URL contract as
 * `/time_entries`, so the file matches the list on screen — columns, filters and sort
 * alike. Redmine exports the whole filtered set here rather than one page; the row cap
 * reuses `issues_export_limit`, next-pm's only export limit setting.
 */
export async function GET(request: Request) {
  const listParams = parseIssueListParams(normalizeSearchParams(new URL(request.url).searchParams));

  const user = await currentUserFromCookies();
  const scope = await resolveGlobalTimeEntryScope(user);
  if (scope.projects.length === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    const candidate = await new DrizzleQueryRepository().findById(listParams.queryId);
    if (
      candidate &&
      candidate.type === "TimeEntryQuery" &&
      candidate.projectId === null &&
      (user?.isAdmin || isQueryVisible(candidate, user?.id ?? "", scope.roleIds))
    ) {
      savedQuery = candidate;
    }
  }

  const settingsRepository = new DrizzleSettingsRepository();
  const settings = await loadGeneralSettings(settingsRepository);
  const result = await listTimeEntries(
    {
      timeEntrySearchRepository: new DrizzleTimeEntrySearchRepository(),
      customFieldRepository: new DrizzleCustomFieldRepository(),
      settingsRepository,
    },
    {
      params: listParams,
      savedQuery,
      visibility: scope.visibility,
      crossProject: true,
      today: new Date().toISOString().slice(0, 10),
      exportLimit: settings.issuesExportLimit,
    },
  );

  const lookups = await loadTimeEntryLookups(scope.projects, {
    issueIds: [...new Set(result.search.entries.map((entry) => entry.issueId).filter((id): id is string => id !== null))],
    userIds: [...new Set(result.search.entries.flatMap((entry) => [entry.userId, entry.authorId]))],
  });
  const rowContext = { lookups, customValues: result.search.customValues };

  const rows = [
    result.displayColumns.map((column) => column.label),
    ...result.search.entries.map((entry) => result.displayColumns.map((column) => timeEntryColumnValue(column, entry, rowContext))),
  ];

  return new NextResponse(encodeCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      'Content-Disposition': 'attachment; filename="timelog.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
