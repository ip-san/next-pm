import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { buildGanttRows, buildMonthTicks, monthsWindow } from "@/domain/gantt/layout";
import { parseYearMonth, nextMonth, previousMonth } from "@/domain/calendar/month-grid";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const MONTHS_SPAN = 3;

export default async function ProjectGanttPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { identifier } = await params;
  const { year: yearParam, month: monthParam } = await searchParams;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const { year, month } = parseYearMonth(yearParam, monthParam, new Date());
  const window = monthsWindow(year, month, MONTHS_SPAN);
  const monthTicks = buildMonthTicks(window);
  const prev = previousMonth(year, month);
  const next = nextMonth(year, month);

  const [allIssues, trackers] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const visibilityRoles = issuesVisibilityRoles(actor);
  const visibleIssues = allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, visibilityRoles));
  const rows = buildGanttRows(visibleIssues, window);
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {project.name} — ガントチャート {window.start} 〜 {window.end}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/projects/${identifier}/gantt?year=${prev.year}&month=${prev.month}`} className="underline">
            « 前月
          </Link>
          <Link href={`/projects/${identifier}/issues`} className="underline">
            チケット一覧
          </Link>
          <Link href={`/projects/${identifier}/gantt?year=${next.year}&month=${next.month}`} className="underline">
            次月 »
          </Link>
        </div>
      </div>

      <div className="border rounded overflow-hidden text-sm">
        <div className="flex border-b bg-gray-50">
          <div className="w-64 shrink-0 px-2 py-1 font-medium border-r">チケット</div>
          <div className="relative flex-1 h-7">
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
        {rows.length === 0 ? (
          <div className="px-2 py-4 text-gray-500">この期間に開始日・期日が設定されたチケットはありません。</div>
        ) : (
          rows.map((row) => (
            <div key={row.issue.id} className="flex border-b last:border-b-0">
              <div className="w-64 shrink-0 px-2 py-1.5 border-r truncate" style={{ paddingLeft: `${8 + row.depth * 16}px` }}>
                <Link href={`/projects/${identifier}/issues/${row.issue.id}`} className="underline" title={row.issue.subject}>
                  {trackerById.get(row.issue.trackerId)?.name ?? "?"} #{row.issue.id.slice(0, 8)} {row.issue.subject}
                </Link>
              </div>
              <div className="relative flex-1 h-9">
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
