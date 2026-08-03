import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import {
  buildTimeReport,
  type TimeReportColumnUnit,
  type TimeReportCriterion,
} from "@/domain/report/time-entry-report";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

const CRITERIA: { value: TimeReportCriterion; label: string }[] = [
  { value: "user", label: "担当者" },
  { value: "activity", label: "作業分類" },
  { value: "issue", label: "チケット" },
];

const COLUMN_UNITS: { value: TimeReportColumnUnit; label: string }[] = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" },
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
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_time_entries", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const { criteria: criteriaParam, columns: columnsParam } = await searchParams;
  const criterion = parseCriterion(criteriaParam);
  const columnUnit = parseColumnUnit(columnsParam);

  const [allEntries, activities] = await Promise.all([
    new DrizzleTimeEntryRepository().listForProject(project.id),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
  ]);
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  const issueIds = [...new Set(allEntries.map((entry) => entry.issueId).filter((id): id is string => id !== null))];
  const issueRepository = new DrizzleIssueRepository();
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((issue) => issue !== null).map((issue) => [issue.id, issue]));

  // Same filter as the plain time-entries list: an entry against a private issue the viewer
  // can't see must not leak that issue's subject, or even the fact that time was logged.
  const visibilityRoles = issuesVisibilityRoles(actor);
  const entries = allEntries.filter((entry) => {
    if (!entry.issueId) return true;
    const issue = issueById.get(entry.issueId);
    return !issue || isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, visibilityRoles);
  });

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
        <h1 className="text-xl font-semibold">{project.name} — 工数レポート</h1>
        <Link href={`/projects/${identifier}/time-entries`} className="text-sm underline">
          一覧に戻る
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span>集計</span>
          {CRITERIA.map((c) => (
            <Link
              key={c.value}
              href={linkFor(c.value, columnUnit)}
              className={c.value === criterion ? "font-semibold underline" : "underline text-gray-500"}
            >
              {c.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span>単位</span>
          {COLUMN_UNITS.map((c) => (
            <Link
              key={c.value}
              href={linkFor(criterion, c.value)}
              className={c.value === columnUnit ? "font-semibold underline" : "underline text-gray-500"}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-4 py-1">{CRITERIA.find((c) => c.value === criterion)?.label}</th>
              {report.periods.map((period) => (
                <th key={period} className="pr-4 py-1 text-right">
                  {period}
                </th>
              ))}
              <th className="pr-4 py-1 text-right">合計</th>
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
                  工数の記録はまだありません。
                </td>
              </tr>
            ) : null}
          </tbody>
          {report.rows.length > 0 ? (
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="pr-4 py-1">合計</td>
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
