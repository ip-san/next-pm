import { NextResponse } from "next/server";
import { listTimeEntries } from "@/application/time-entries/list-time-entries";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { can } from "@/domain/authorization/authorization-service";
import { encodeCsv } from "@/domain/csv/encode";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntrySearchRepository } from "@/infrastructure/db/repositories/time-entry-search-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { loadTimeEntryLookups, timeEntryProjectScope, timeEntryScopesFor } from "@/interface/http/time-entry-list";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";
import { timeEntryColumnValue } from "@/interface/query/time-entry-list-view";

export const dynamic = "force-dynamic";

/**
 * The query-driven CSV behind the project time-entry list's "CSV" link — the columns,
 * filters and sort the list is showing, as Redmine's `TimelogController#index.csv` does.
 *
 * It sits beside `../csv` rather than replacing it: that one has a fixed column set that
 * the time-entry importer round-trips with, and a column selection the user can change is
 * not a format an importer can rely on.
 */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const listParams = parseIssueListParams(normalizeSearchParams(new URL(request.url).searchParams));

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const projectContext = toAuthorizationProject(project);
  const resolved = await resolveActor(user, project.id);
  if (!can({ permission: "view_time_entries", project: projectContext, actor: resolved.actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const projectEntry = { ...resolved, project, projectContext };
  // Same subtree as the list page, so the export matches what's on screen.
  const scopes = await timeEntryScopesFor(user, projectEntry);
  const userGroupIds = user ? await new DrizzleGroupRepository().listGroupIdsForUser(user.id) : [];

  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    const candidate = await new DrizzleQueryRepository().findById(listParams.queryId);
    if (
      candidate &&
      candidate.type === "TimeEntryQuery" &&
      (candidate.projectId === null || candidate.projectId === project.id) &&
      isQueryVisible(candidate, user?.id ?? "", resolved.roleIds)
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
      visibility: { userId: user?.id ?? null, userGroupIds, projects: scopes.map(timeEntryProjectScope) },
      crossProject: false,
      today: new Date().toISOString().slice(0, 10),
      exportLimit: settings.issuesExportLimit,
    },
  );

  const lookups = await loadTimeEntryLookups(scopes, {
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
      "Content-Disposition": `attachment; filename="timelog-${identifier}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
