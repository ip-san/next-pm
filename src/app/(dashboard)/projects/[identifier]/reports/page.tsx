import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { aggregateIssueCounts, totalCounts, type ReportCounts } from "@/domain/report/issue-report";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";

const NONE_LABEL = "(なし)";

interface ReportRow {
  key: string | null;
  label: string;
  counts: ReportCounts;
}

function ReportTable({ title, rows, totals }: { title: string; rows: ReportRow[]; totals: ReportCounts }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-semibold text-sm">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">データがありません。</p>
      ) : (
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="pr-4 py-0.5" />
              <th scope="col" className="pr-4 py-0.5 text-right">未対応</th>
              <th scope="col" className="pr-4 py-0.5 text-right">完了</th>
              <th scope="col" className="pr-4 py-0.5 text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key ?? "__none__"} className="border-b">
                <th scope="row" className="pr-4 py-0.5 text-left font-normal">{row.label}</th>
                <td className="pr-4 py-0.5 text-right">{row.counts.open}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.closed}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.total}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <th scope="row" className="pr-4 py-0.5 text-left">合計</th>
              <td className="pr-4 py-0.5 text-right">{totals.open}</td>
              <td className="pr-4 py-0.5 text-right">{totals.closed}</td>
              <td className="pr-4 py-0.5 text-right">{totals.total}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function ProjectReportsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const [allIssues, statuses, trackers, priorities, categories, versions, members] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listSharedWith(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const issues = allIssues.filter(visibleIssueFilter(user?.id ?? null, actor));
  const closedStatusIds = new Set(statuses.filter((s) => s.isClosed).map((s) => s.id));

  // Authors/assignees on the actual issues aren't necessarily project members (an admin can
  // author an issue without being added as one), so the user lookup is built from every id
  // that actually appears on an issue, unioned with the member list — not members alone.
  const relevantUserIds = new Set(members.map((m) => m.userId));
  for (const issue of issues) {
    relevantUserIds.add(issue.authorId);
    if (issue.assignedToId) relevantUserIds.add(issue.assignedToId);
  }
  const relevantUsers = await new DrizzleUserRepository().findByIds([...relevantUserIds]);
  const memberUsers = relevantUsers.filter((u) => members.some((m) => m.userId === u.id));

  function buildRows(
    keyOf: (issue: (typeof issues)[number]) => string | null,
    dimension: { id: string; label: string }[],
    includeNone: boolean,
  ): { rows: ReportRow[]; totals: ReportCounts } {
    const counts = aggregateIssueCounts(issues, closedStatusIds, keyOf);
    const rows: ReportRow[] = dimension
      .map((d) => ({ key: d.id, label: d.label, counts: counts.get(d.id) ?? { open: 0, closed: 0, total: 0 } }))
      .filter((row) => row.counts.total > 0);
    if (includeNone && counts.has(null)) {
      rows.push({ key: null, label: NONE_LABEL, counts: counts.get(null)! });
    }
    return { rows, totals: totalCounts(counts) };
  }

  const overallTotals = totalCounts(aggregateIssueCounts(issues, closedStatusIds, () => null));

  const breakdowns = [
    { title: "トラッカー別", keyOf: (i: (typeof issues)[number]) => i.trackerId, dimension: trackers.map((t) => ({ id: t.id, label: t.name })), includeNone: false },
    { title: "優先度別", keyOf: (i: (typeof issues)[number]) => i.priorityId, dimension: priorities.map((p) => ({ id: p.id, label: p.name })), includeNone: false },
    {
      title: "担当者別",
      keyOf: (i: (typeof issues)[number]) => i.assignedToId,
      dimension: memberUsers.map((u) => ({ id: u.id, label: `${u.lastname} ${u.firstname}` })),
      includeNone: true,
    },
    {
      title: "作成者別",
      keyOf: (i: (typeof issues)[number]) => i.authorId,
      dimension: relevantUsers.map((u) => ({ id: u.id, label: `${u.lastname} ${u.firstname}` })),
      includeNone: false,
    },
    { title: "バージョン別", keyOf: (i: (typeof issues)[number]) => i.fixedVersionId, dimension: versions.map((v) => ({ id: v.id, label: v.name })), includeNone: true },
    { title: "カテゴリ別", keyOf: (i: (typeof issues)[number]) => i.categoryId, dimension: categories.map((c) => ({ id: c.id, label: c.name })), includeNone: true },
  ];

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — レポート</h1>
        <Link href={`/projects/${identifier}/issues`} className="underline text-sm">
          チケット一覧
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        全チケット {overallTotals.total} 件（未対応 {overallTotals.open} / 完了 {overallTotals.closed}）
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {breakdowns.map((breakdown) => {
          const { rows, totals } = buildRows(breakdown.keyOf, breakdown.dimension, breakdown.includeNone);
          return <ReportTable key={breakdown.title} title={breakdown.title} rows={rows} totals={totals} />;
        })}
      </div>
    </main>
  );
}
