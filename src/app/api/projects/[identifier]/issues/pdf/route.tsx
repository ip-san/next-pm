import { projectIssueListScopeFor } from "@/interface/http/project-issue-scope";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { can } from "@/domain/authorization/authorization-service";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issueVisibilityScope, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { spentHoursScopeFor } from "@/interface/http/time-entry-access";
import { normalizeSearchParams, parseIssueListParams } from "@/interface/query/issue-query-params";
import { IssuesPdfDocument } from "./issues-pdf-document";
import { localeForViewer } from "@/interface/http/locale";

export const dynamic = "force-dynamic";

// Cookie-authed download endpoint, same pattern as the CSV export and the gantt PDF export —
// outside /api/v1 since this serves the HTML issues list's "PDF" link, not the Bearer/Basic
// REST API surface. Reads the same URL contract and runs the same use case as the list page
// and the CSV export, so filters, sort and visibility never drift between the three. Unlike
// the CSV it keeps a fixed column set, because IssuesPdfDocument has a fixed page layout.
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
    // Redmine's `global_or_on_project`: a project list may apply its own queries and the global ones.
    if (candidate && (candidate.projectId === null || candidate.projectId === project.id) && isQueryVisible(candidate, user?.id ?? "", roleIds)) {
      savedQuery = candidate;
    }
  }

  const settings = await loadGeneralSettings(settingsRepository);
  const [result, statuses, trackers] = await Promise.all([
    listProjectIssues(
      {
        issueSearchRepository: new DrizzleIssueSearchRepository(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
        customFieldRepository: new DrizzleCustomFieldRepository(),
        settingsRepository,
      },
      {
        projectId: project.id,
        ...(await projectIssueListScopeFor(user, project, roleIds)),
        params: listParams,
        savedQuery,
        visibility: issueVisibilityScope(user?.id ?? null, actor, userGroupIds),
        canViewTimeEntries: can({ permission: "view_time_entries", project: projectContext, actor }),
        spentHoursScope: spentHoursScopeFor(actor, user?.id ?? null),
        today: new Date().toISOString().slice(0, 10),
        exportLimit: settings.issuesExportLimit,
      },
    ),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  const rows = result.search.issues.map((issue) => ({
    id: issue.id,
    number: issue.number,
    trackerName: trackerById.get(issue.trackerId)?.name ?? "",
    subject: issue.subject,
    statusName: statusById.get(issue.statusId)?.name ?? "",
    doneRatio: issue.doneRatio,
  }));

  const buffer = await renderToBuffer(<IssuesPdfDocument projectName={project.name} rows={rows} locale={await localeForViewer(user)} />);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="issues-${identifier}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
