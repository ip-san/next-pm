import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { buildMonthGrid, nextMonth, parseYearMonth, previousMonth } from "@/domain/calendar/month-grid";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { subtreeVisibleIssues } from "@/interface/http/project-issue-scope";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const WEEKDAY_KEYS: MessageKey[] = ["calendar.mon", "calendar.tue", "calendar.wed", "calendar.thu", "calendar.fri", "calendar.sat", "calendar.sun"];

export default async function ProjectCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const { year: yearParam, month: monthParam } = await searchParams;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  // Redmine's CalendarsController authorizes `view_calendar` alone and then renders
  // `Issue.visible`, which is empty without `view_issues` — the two are collapsed into one
  // gate here because this page has no content other than issues and versions.
  const projectContext = toAuthorizationProject(project);
  if (
    !can({ permission: "view_calendar", project: projectContext, actor }) ||
    !can({ permission: "view_issues", project: projectContext, actor })
  ) {
    notFound();
  }

  const { year, month } = parseYearMonth(yearParam, monthParam, new Date());
  const grid = buildMonthGrid(year, month);
  const prev = previousMonth(year, month);
  const next = nextMonth(year, month);

  // Redmine's CalendarsController shows an issue on every day its start_date OR due_date
  // falls within the grid range (not just fully-contained spans) — compileFilters only
  // expresses an AND of predicates, so this OR is applied here rather than bent into the
  // builder.
  const [allIssues, sharedVersions, statuses, trackers] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleVersionRepository().listSharedWith(project.id),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const visibilityRoles = issuesVisibilityRoles(actor);
  // display_subprojects_issues: the calendar also shows the subprojects' issues, each judged by its own project.
  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const subtree = displaySubprojectsIssues ? await subtreeVisibleIssues(user, project) : null;
  const visibleIssues = subtree
    ? subtree.issues
    : allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, visibilityRoles));
  const identifierByProjectId = subtree?.identifierByProjectId ?? new Map([[project.id, identifier]]);

  const issuesByDay = new Map<string, typeof visibleIssues>();
  for (const issue of visibleIssues) {
    const days = new Set<string>();
    if (issue.startDate && issue.startDate >= grid.startDate && issue.startDate <= grid.endDate) days.add(issue.startDate);
    if (issue.dueDate && issue.dueDate >= grid.startDate && issue.dueDate <= grid.endDate) days.add(issue.dueDate);
    for (const day of days) {
      issuesByDay.set(day, [...(issuesByDay.get(day) ?? []), issue]);
    }
  }

  const versionsByDay = new Map<string, typeof sharedVersions>();
  for (const version of sharedVersions) {
    if (version.effectiveDate && version.effectiveDate >= grid.startDate && version.effectiveDate <= grid.endDate) {
      versionsByDay.set(version.effectiveDate, [...(versionsByDay.get(version.effectiveDate) ?? []), version]);
    }
  }

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {interpolate(translate(locale, "calendar.title"), { project: project.name, year, month })}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/projects/${identifier}/calendar?year=${prev.year}&month=${prev.month}`} className="underline">
            {translate(locale, "calendar.prevMonth")}
          </Link>
          <Link href={`/projects/${identifier}/issues`} className="underline">
            {translate(locale, "calendar.issueList")}
          </Link>
          <Link href={`/projects/${identifier}/calendar?year=${next.year}&month=${next.month}`} className="underline">
            {translate(locale, "calendar.nextMonth")}
          </Link>
        </div>
      </div>

      <table className="border-collapse text-xs w-full">
        <thead>
          <tr>
            {WEEKDAY_KEYS.map((key) => (
              <th key={key} className="border px-2 py-1 w-[14.28%] text-left">
                {translate(locale, key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const inMonth = day.slice(5, 7) === String(month).padStart(2, "0");
                const dayIssues = issuesByDay.get(day) ?? [];
                const dayVersions = versionsByDay.get(day) ?? [];
                return (
                  <td key={day} className={`border px-1 py-1 align-top h-24 ${inMonth ? "" : "bg-gray-50 text-gray-400"}`}>
                    <div className="font-medium">{Number(day.slice(8, 10))}</div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {dayVersions.map((version) => (
                        <Link
                          key={version.id}
                          href={`/projects/${identifier}/versions/${version.id}`}
                          className="text-purple-700 underline truncate block"
                          title={version.name}
                        >
                          🏁 {version.name}
                        </Link>
                      ))}
                      {dayIssues.map((issue) => (
                        <Link
                          key={issue.id}
                          href={`/projects/${identifierByProjectId.get(issue.projectId) ?? identifier}/issues/${issue.id}`}
                          className="underline truncate block"
                          title={`${trackerById.get(issue.trackerId)?.name ?? "?"}: ${issue.subject}`}
                        >
                          {statusById.get(issue.statusId)?.isClosed ? "✓ " : ""}
                          {issue.subject}
                        </Link>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
