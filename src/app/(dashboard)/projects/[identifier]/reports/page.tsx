import Link from "next/link";
import type { Locale } from "@/domain/i18n/locales";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
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


interface ReportRow {
  key: string | null;
  label: string;
  counts: ReportCounts;
  href?: string;
}

function ReportTable({ title, rows, totals, locale }: { title: string; rows: ReportRow[]; totals: ReportCounts; locale: Locale }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-semibold text-sm">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "reports.none")}</p>
      ) : (
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="pr-4 py-0.5" />
              <th scope="col" className="pr-4 py-0.5 text-right">{translate(locale, "project.statusOpen")}</th>
              <th scope="col" className="pr-4 py-0.5 text-right">{translate(locale, "project.statusClosed")}</th>
              <th scope="col" className="pr-4 py-0.5 text-right">{translate(locale, "query.totals")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key ?? "__none__"} className="border-b">
                <th scope="row" className="pr-4 py-0.5 text-left font-normal">
                  {row.href ? <Link href={row.href} className="underline">{row.label}</Link> : row.label}
                </th>
                <td className="pr-4 py-0.5 text-right">{row.counts.open}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.closed}</td>
                <td className="pr-4 py-0.5 text-right">{row.counts.total}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <th scope="row" className="pr-4 py-0.5 text-left">{translate(locale, "query.totals")}</th>
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
  const locale = await currentLocale();
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const projectRepository = new DrizzleProjectRepository();
  const issueRepository = new DrizzleIssueRepository();
  const [allIssues, statuses, trackers, priorities, categories, versions, members, descendants] = await Promise.all([
    issueRepository.listByProject(project.id),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listSharedWith(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
    projectRepository.listDescendants(project.id),
  ]);
  const issues = allIssues.filter(visibleIssueFilter(user?.id ?? null, actor, userGroupIds));
  const closedStatusIds = new Set(statuses.filter((s) => s.isClosed).map((s) => s.id));

  // Subproject counts are issues actually IN each subproject, not this project's own issues
  // rolled up — mirrors Redmine's Issue.by_subproject. Each subproject gets its own
  // resolveActor/visibleIssueFilter since the actor's role (and therefore private-issue
  // visibility) can differ per project, exactly like visiting that subproject directly would.
  const visibleSubprojects: typeof descendants = [];
  const subprojectIssues: typeof allIssues = [];
  for (const subproject of descendants) {
    const { actor: subActor, userGroupIds: subUserGroupIds } = await resolveActor(user, subproject.id);
    if (!can({ permission: "view_issues", project: toAuthorizationProject(subproject), actor: subActor })) {
      continue;
    }
    visibleSubprojects.push(subproject);
    const subIssues = await issueRepository.listByProject(subproject.id);
    subprojectIssues.push(...subIssues.filter(visibleIssueFilter(user?.id ?? null, subActor, subUserGroupIds)));
  }

  // Authors/assignees on the actual issues aren't necessarily project members (an admin can
  // author an issue without being added as one), so the user lookup is built from every id
  // that actually appears on an issue, unioned with the member list — not members alone.
  const relevantUserIds = new Set(memberUserIds(members));
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
      rows.push({ key: null, label: translate(locale, "query.none"), counts: counts.get(null)! });
    }
    return { rows, totals: totalCounts(counts) };
  }

  const overallTotals = totalCounts(aggregateIssueCounts(issues, closedStatusIds, () => null));

  const breakdowns = [
    { title: translate(locale, "reports.byTracker"), keyOf: (i: (typeof issues)[number]) => i.trackerId, dimension: trackers.map((t) => ({ id: t.id, label: t.name })), includeNone: false },
    { title: translate(locale, "reports.byPriority"), keyOf: (i: (typeof issues)[number]) => i.priorityId, dimension: priorities.map((p) => ({ id: p.id, label: p.name })), includeNone: false },
    {
      title: translate(locale, "reports.byAssignee"),
      keyOf: (i: (typeof issues)[number]) => i.assignedToId,
      dimension: memberUsers.map((u) => ({ id: u.id, label: `${u.lastname} ${u.firstname}` })),
      includeNone: true,
    },
    {
      title: translate(locale, "reports.byAuthor"),
      keyOf: (i: (typeof issues)[number]) => i.authorId,
      dimension: relevantUsers.map((u) => ({ id: u.id, label: `${u.lastname} ${u.firstname}` })),
      includeNone: false,
    },
    { title: translate(locale, "reports.byVersion"), keyOf: (i: (typeof issues)[number]) => i.fixedVersionId, dimension: versions.map((v) => ({ id: v.id, label: v.name })), includeNone: true },
    { title: translate(locale, "reports.byCategory"), keyOf: (i: (typeof issues)[number]) => i.categoryId, dimension: categories.map((c) => ({ id: c.id, label: c.name })), includeNone: true },
  ];

  const allBreakdowns = breakdowns.map((breakdown) => ({ title: breakdown.title, ...buildRows(breakdown.keyOf, breakdown.dimension, breakdown.includeNone) }));
  if (visibleSubprojects.length > 0) {
    const subprojectCounts = aggregateIssueCounts(subprojectIssues, closedStatusIds, (i) => i.projectId);
    const rows: ReportRow[] = visibleSubprojects
      .map((sub) => ({
        key: sub.id,
        label: sub.name,
        counts: subprojectCounts.get(sub.id) ?? { open: 0, closed: 0, total: 0 },
        href: `/projects/${sub.identifier}/reports`,
      }))
      .filter((row) => row.counts.total > 0);
    allBreakdowns.push({ title: translate(locale, "reports.bySubproject"), rows, totals: totalCounts(subprojectCounts) });
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "reports.title"), { project: project.name })}</h1>
        <Link href={`/projects/${identifier}/issues`} className="underline text-sm">
          {translate(locale, "reports.issueList")}
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        {interpolate(translate(locale, "reports.summary"), { total: overallTotals.total, open: overallTotals.open, closed: overallTotals.closed })}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {allBreakdowns.map((breakdown) => (
          <ReportTable key={breakdown.title} title={breakdown.title} rows={breakdown.rows} totals={breakdown.totals} locale={locale} />
        ))}
      </div>
    </main>
  );
}
