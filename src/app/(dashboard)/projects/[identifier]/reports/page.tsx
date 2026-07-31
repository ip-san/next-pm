import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { aggregateIssueCounts, type ReportCounts } from "@/domain/report/issue-report";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
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
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const NONE_LABEL = "(なし)";

interface ReportRow {
  key: string | null;
  label: string;
  link?: string;
  counts: ReportCounts;
}

function ReportTable({ title, rows }: { title: string; rows: ReportRow[] }) {
  const total = rows.reduce(
    (acc, row) => ({ open: acc.open + row.counts.open, closed: acc.closed + row.counts.closed, total: acc.total + row.counts.total }),
    { open: 0, closed: 0, total: 0 },
  );
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-semibold text-sm">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">データがありません。</p>
      ) : (
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="pr-4 py-0.5" />
              <th className="pr-4 py-0.5 text-right">未対応</th>
              <th className="pr-4 py-0.5 text-right">完了</th>
              <th className="pr-4 py-0.5 text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key ?? "__none__"} className="border-b">
                <td className="pr-4 py-0.5">{row.label}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.open}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.closed}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.total}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="pr-4 py-0.5">合計</td>
              <td className="pr-4 py-0.5 text-right">{total.open}</td>
              <td className="pr-4 py-0.5 text-right">{total.closed}</td>
              <td className="pr-4 py-0.5 text-right">{total.total}</td>
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
  const visibilityRoles = issuesVisibilityRoles(actor);
  const issues = allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, visibilityRoles));
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
  const userById = new Map(relevantUsers.map((u) => [u.id, u]));
  const memberUsers = relevantUsers.filter((u) => members.some((m) => m.userId === u.id));

  function buildRows(
    keyOf: (issue: (typeof issues)[number]) => string | null,
    dimension: { id: string; label: string }[],
    includeNone: boolean,
  ): ReportRow[] {
    const counts = aggregateIssueCounts(issues, closedStatusIds, keyOf);
    const rows: ReportRow[] = dimension
      .map((d) => ({ key: d.id, label: d.label, counts: counts.get(d.id) ?? { open: 0, closed: 0, total: 0 } }))
      .filter((row) => row.counts.total > 0);
    if (includeNone && counts.has(null)) {
      rows.push({ key: null, label: NONE_LABEL, counts: counts.get(null)! });
    }
    return rows;
  }

  const trackerRows = buildRows(
    (i) => i.trackerId,
    trackers.map((t) => ({ id: t.id, label: t.name })),
    false,
  );
  const priorityRows = buildRows(
    (i) => i.priorityId,
    priorities.map((p) => ({ id: p.id, label: p.name })),
    false,
  );
  const categoryRows = buildRows(
    (i) => i.categoryId,
    categories.map((c) => ({ id: c.id, label: c.name })),
    true,
  );
  const versionRows = buildRows(
    (i) => i.fixedVersionId,
    versions.map((v) => ({ id: v.id, label: v.name })),
    true,
  );
  const assigneeRows = buildRows(
    (i) => i.assignedToId,
    memberUsers.map((u) => ({ id: u.id, label: `${u.lastname} ${u.firstname}` })),
    true,
  );
  const authorRows = buildRows(
    (i) => i.authorId,
    [...userById.values()].map((u) => ({ id: u.id, label: `${u.lastname} ${u.firstname}` })),
    false,
  );

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — レポート</h1>
        <Link href={`/projects/${identifier}/issues`} className="underline text-sm">
          チケット一覧
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        全チケット {issues.length} 件（未対応 {issues.length - issues.filter((i) => closedStatusIds.has(i.statusId)).length} / 完了{" "}
        {issues.filter((i) => closedStatusIds.has(i.statusId)).length}）
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <ReportTable title="トラッカー別" rows={trackerRows} />
        <ReportTable title="優先度別" rows={priorityRows} />
        <ReportTable title="担当者別" rows={assigneeRows} />
        <ReportTable title="作成者別" rows={authorRows} />
        <ReportTable title="バージョン別" rows={versionRows} />
        <ReportTable title="カテゴリ別" rows={categoryRows} />
      </div>
    </main>
  );
}
