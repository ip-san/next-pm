import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import {
  buildGanttRows,
  buildMonthTicks,
  buildVersionRows,
  ganttTimelineWidth,
  GANTT_ZOOM_MAX,
  monthsWindow,
  resolveGanttMonths,
  resolveGanttZoom,
} from "@/domain/gantt/layout";
import { parseYearMonth } from "@/domain/calendar/month-grid";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { subtreeVisibleIssues } from "@/interface/http/project-issue-scope";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export default async function ProjectGanttPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ year?: string; month?: string; zoom?: string; months?: string }>;
}) {
  const { identifier } = await params;
  const { year: yearParam, month: monthParam, zoom: zoomParam, months: monthsParam } = await searchParams;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  // See the calendar page: Redmine authorizes `view_gantt` and then renders `Issue.visible`.
  const projectContext = toAuthorizationProject(project);
  if (
    !can({ permission: "view_gantt", project: projectContext, actor }) ||
    !can({ permission: "view_issues", project: projectContext, actor })
  ) {
    notFound();
  }

  // Redmine keeps zoom and the month count as the viewer's last choice; here they travel in the URL.
  const zoom = resolveGanttZoom(zoomParam);
  const months = resolveGanttMonths(monthsParam);
  const { year, month } = parseYearMonth(yearParam, monthParam, new Date());
  const window = monthsWindow(year, month, months);
  const monthTicks = buildMonthTicks(window);
  // Redmine steps the page by the displayed span (date_from << months), not by one month.
  const shifted = (delta: number) => {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  };
  const prev = shifted(-months);
  const next = shifted(months);
  const linkQuery = (target: { year: number; month: number }, z = zoom, m = months) =>
    `year=${target.year}&month=${target.month}&zoom=${z}&months=${m}`;
  const timelineWidth = ganttTimelineWidth(window, zoom);

  const [allIssues, trackers, versions] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleVersionRepository().listSharedWith(project.id),
  ]);
  const visibilityRoles = issuesVisibilityRoles(actor);
  // display_subprojects_issues: the chart also shows the subprojects' issues, each judged by its own project.
  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const subtree = displaySubprojectsIssues ? await subtreeVisibleIssues(user, project) : null;
  const visibleIssues = subtree
    ? subtree.issues
    : allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, visibilityRoles));
  const identifierByProjectId = subtree?.identifierByProjectId ?? new Map([[project.id, identifier]]);
  const rows = buildGanttRows(visibleIssues, window);
  const versionRows = buildVersionRows(versions, visibleIssues, window);
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {project.name} — ガントチャート {window.start} 〜 {window.end}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/projects/${identifier}/gantt?${linkQuery(prev)}`} className="underline">
            « 前
          </Link>
          <Link href={`/projects/${identifier}/gantt?${linkQuery(next)}`} className="underline">
            次 »
          </Link>
          {zoom > 1 ? (
            <Link href={`/projects/${identifier}/gantt?${linkQuery({ year, month }, zoom - 1)}`} className="underline">
              縮小
            </Link>
          ) : null}
          {zoom < GANTT_ZOOM_MAX ? (
            <Link href={`/projects/${identifier}/gantt?${linkQuery({ year, month }, zoom + 1)}`} className="underline">
              拡大
            </Link>
          ) : null}
          <Link href={`/projects/${identifier}/issues`} className="underline">
            チケット一覧
          </Link>
          <a href={`/api/projects/${identifier}/gantt/pdf?year=${year}&month=${month}`} className="underline">
            PDF
          </a>
        </div>
      </div>

      <div className="border rounded overflow-x-auto text-sm">
        <div className="flex border-b bg-gray-50">
          <div className="w-64 shrink-0 px-2 py-1 font-medium border-r">チケット</div>
          <div className="relative h-7 shrink-0" style={{ width: `${timelineWidth}px` }}>
            {monthTicks.map((tick) => (
              <div
                key={tick.label}
                className="absolute top-0 bottom-0 border-l text-xs px-1 text-gray-500"
                style={{ left: `${tick.leftPercent}%` }}
              >
                {tick.label}
              </div>
            ))}
          </div>
        </div>
        {versionRows.map((row) => (
          <div key={`version-${row.version.id}`} className="flex border-b last:border-b-0 bg-gray-50">
            <div className="w-64 shrink-0 px-2 py-1.5 border-r truncate font-medium">{row.version.name}</div>
            <div className="relative h-9 shrink-0" style={{ width: `${timelineWidth}px` }}>
              <div
                className="absolute top-1.5 h-6 bg-gray-400 rounded"
                style={{ left: `${row.leftPercent}%`, width: `${row.widthPercent}%` }}
                title={`バージョン ${row.version.name}（期日 ${row.version.effectiveDate}）`}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && versionRows.length === 0 ? (
          <div className="px-2 py-4 text-gray-500">この期間に開始日・期日が設定されたチケットはありません。</div>
        ) : (
          rows.map((row) => (
            <div key={row.issue.id} className="flex border-b last:border-b-0">
              <div className="w-64 shrink-0 px-2 py-1.5 border-r truncate" style={{ paddingLeft: `${8 + row.depth * 16}px` }}>
                <Link
                  href={`/projects/${identifierByProjectId.get(row.issue.projectId) ?? identifier}/issues/${row.issue.id}`}
                  className="underline"
                  title={row.issue.subject}
                >
                  {trackerById.get(row.issue.trackerId)?.name ?? "?"} #{row.issue.number} {row.issue.subject}
                </Link>
              </div>
              <div className="relative h-9 shrink-0" style={{ width: `${timelineWidth}px` }}>
                <div
                  className="absolute top-1.5 h-6 bg-blue-500 rounded"
                  style={{ left: `${row.leftPercent}%`, width: `${row.widthPercent}%` }}
                  title={`${row.issue.startDate ?? row.issue.dueDate} 〜 ${row.issue.dueDate ?? row.issue.startDate} (${row.issue.doneRatio}%)`}
                >
                  <div className="h-full bg-blue-700 rounded-l" style={{ width: `${row.issue.doneRatio}%` }} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
