import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import {
  buildTimeReport,
  type TimeReportColumnUnit,
  type TimeReportCriterion,
} from "@/domain/report/time-entry-report";
import { loadProjectActivities } from "@/application/time-entries/project-activities";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { timeEntryScopesFor } from "@/interface/http/time-entry-list";
import { filterAccessibleTimeEntries } from "@/interface/http/time-entry-access";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";

export const dynamic = "force-dynamic";

const CRITERIA: { value: TimeReportCriterion; labelKey: MessageKey }[] = [
  { value: "user", labelKey: "timeReport.user" },
  { value: "activity", labelKey: "timeReport.activity" },
  { value: "issue", labelKey: "timeReport.issue" },
];

const COLUMN_UNITS: { value: TimeReportColumnUnit; labelKey: MessageKey }[] = [
  { value: "day", labelKey: "timeReport.day" },
  { value: "week", labelKey: "timeReport.week" },
  { value: "month", labelKey: "timeReport.month" },
];

function parseCriterion(value: string | undefined): TimeReportCriterion {
  return value === "activity" || value === "issue" ? value : "user";
}

function parseColumnUnit(value: string | undefined): TimeReportColumnUnit {
  return value === "day" || value === "week" ? value : "month";
}

export default async function TimeEntryReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ criteria?: string; columns?: string }>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const projectContext = toAuthorizationProject(project);
  const resolved = await resolveActor(user, project.id);
  const { actor } = resolved;
  if (!can({ permission: "view_time_entries", project: projectContext, actor })) {
    notFound();
  }

  const { criteria: criteriaParam, columns: columnsParam } = await searchParams;
  const criterion = parseCriterion(criteriaParam);
  const columnUnit = parseColumnUnit(columnsParam);

  // display_subprojects_issues: the report also covers the subprojects' entries, each project's entries filtered
  // with that project's own actor and rules, and its activity names read from that project.
  const scopes = await timeEntryScopesFor(user, { ...resolved, project, projectContext });

  const perScope = await Promise.all(
    scopes.map(async (scope) => {
      const [scopeEntries, { byId }] = await Promise.all([
        new DrizzleTimeEntryRepository().listForProject(scope.project.id),
        // See the time-entries list: the lookup must cover deactivated activities too.
        loadProjectActivities(
          { enumerationRepository: new DrizzleEnumerationRepository(), projectActivityRepository: new DrizzleProjectActivityRepository() },
          scope.project.id,
        ),
      ]);
      return { scope, scopeEntries, activities: byId };
    }),
  );
  const activityById = new Map(perScope.flatMap((entry) => [...entry.activities]));
  const allEntries = perScope.flatMap((entry) => entry.scopeEntries.map((timeEntry) => ({ entry: timeEntry, scope: entry.scope })));

  const issueIds = [...new Set(allEntries.map(({ entry }) => entry.issueId).filter((id): id is string => id !== null))];
  const issueRepository = new DrizzleIssueRepository();
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((issue) => issue !== null).map((issue) => [issue.id, issue]));

  // Same shared predicate as the plain time-entries list, applied with each entry's own project's context.
  const entries = allEntries.flatMap(({ entry, scope }) =>
    filterAccessibleTimeEntries([entry], {
      userId: user?.id ?? null,
      actor: scope.actor,
      userGroupIds: scope.userGroupIds,
      projectContext: scope.projectContext,
      issueById,
    }),
  );

  const users = await new DrizzleUserRepository().findByIds([...new Set(entries.map((entry) => entry.userId))]);
  const userById = new Map(users.map((u) => [u.id, u]));

  const report = buildTimeReport(entries, criterion, columnUnit);

  function rowLabel(key: string | null): string {
    if (key === null) return "-";
    switch (criterion) {
      case "user": {
        const u = userById.get(key);
        return u ? `${u.lastname} ${u.firstname}` : key.slice(0, 8);
      }
      case "activity":
        return activityById.get(key)?.name ?? key.slice(0, 8);
      case "issue":
        return issueById.get(key)?.subject ?? key.slice(0, 8);
    }
  }

  function linkFor(nextCriterion: TimeReportCriterion, nextColumnUnit: TimeReportColumnUnit): string {
    return `/projects/${identifier}/time-entries/report?criteria=${nextCriterion}&columns=${nextColumnUnit}`;
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "timeReport.title"), { project: project.name })}</h1>
        <Link href={`/projects/${identifier}/time-entries`} className="text-sm underline">
          {translate(locale, "timeEntries.backToList")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span>{translate(locale, "timeReport.criteria")}</span>
          {CRITERIA.map((c) => (
            <Link
              key={c.value}
              href={linkFor(c.value, columnUnit)}
              className={c.value === criterion ? "font-semibold underline" : "underline text-gray-500"}
            >
              {translate(locale, c.labelKey)}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span>{translate(locale, "timeReport.unit")}</span>
          {COLUMN_UNITS.map((c) => (
            <Link
              key={c.value}
              href={linkFor(criterion, c.value)}
              className={c.value === columnUnit ? "font-semibold underline" : "underline text-gray-500"}
            >
              {translate(locale, c.labelKey)}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-4 py-1">{translate(locale, CRITERIA.find((c) => c.value === criterion)?.labelKey ?? "timeReport.user")}</th>
              {report.periods.map((period) => (
                <th key={period} className="pr-4 py-1 text-right">
                  {period}
                </th>
              ))}
              <th className="pr-4 py-1 text-right">{translate(locale, "query.totals")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.key ?? "__none__"} className="border-b">
                <td className="pr-4 py-1">{rowLabel(row.key)}</td>
                {report.periods.map((period) => (
                  <td key={period} className="pr-4 py-1 text-right">
                    {row.hoursByPeriod.get(period)?.toFixed(2) ?? "-"}
                  </td>
                ))}
                <td className="pr-4 py-1 text-right font-semibold">{row.total.toFixed(2)}</td>
              </tr>
            ))}
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={report.periods.length + 2} className="py-2 text-gray-500">
                  {translate(locale, "timeReport.empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
          {report.rows.length > 0 ? (
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="pr-4 py-1">{translate(locale, "query.totals")}</td>
                {report.periods.map((period) => (
                  <td key={period} className="pr-4 py-1 text-right">
                    {(report.totalsByPeriod.get(period) ?? 0).toFixed(2)}
                  </td>
                ))}
                <td className="pr-4 py-1 text-right">{report.grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </main>
  );
}
