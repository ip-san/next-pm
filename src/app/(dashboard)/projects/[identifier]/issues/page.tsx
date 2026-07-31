import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { compileFilters, type FilterCondition } from "@/domain/query/filter-builder";
import { isQueryVisible } from "@/domain/query/visibility";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { SaveQueryForm } from "./save-query-form";

export default async function ProjectIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ status_id?: string; query_id?: string }>;
}) {
  const { identifier } = await params;
  const { status_id: statusFilter, query_id: queryId } = await searchParams;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const queryRepository = new DrizzleQueryRepository();
  const allQueries = await queryRepository.listForProject(project.id);
  const visibleQueries = allQueries.filter((q) => isQueryVisible(q, user?.id ?? "", roleIds));

  // ?query_id= is client-supplied — re-verify it belongs to this project and is visible to
  // this actor before trusting its filters, rather than trusting the id alone (IDOR-safe).
  let appliedFilters: FilterCondition[] = [];
  if (queryId) {
    const query = await queryRepository.findById(queryId);
    if (query && query.projectId === project.id && isQueryVisible(query, user?.id ?? "", roleIds)) {
      appliedFilters = query.filters;
    }
  } else if (statusFilter) {
    appliedFilters = [{ field: "status_id", operator: "=", values: [statusFilter] }];
  }

  const predicates = compileFilters(appliedFilters);

  const [allIssues, statuses, trackers] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id, predicates),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const visibilityRoles = issuesVisibilityRoles(actor);
  const issues = allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, visibilityRoles));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — チケット</h1>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${identifier}/reports`} className="border rounded px-3 py-2 text-sm">
            レポート
          </Link>
          <Link href={`/projects/${identifier}/gantt`} className="border rounded px-3 py-2 text-sm">
            ガントチャート
          </Link>
          <Link href={`/projects/${identifier}/calendar`} className="border rounded px-3 py-2 text-sm">
            カレンダー
          </Link>
          <a
            href={`/api/projects/${identifier}/issues/csv${statusFilter ? `?status_id=${statusFilter}` : ""}`}
            className="border rounded px-3 py-2 text-sm"
          >
            CSV
          </a>
          <Link href={`/projects/${identifier}/issues/import`} className="border rounded px-3 py-2 text-sm">
            CSV取り込み
          </Link>
          <Link href={`/projects/${identifier}/issues/new`} className="bg-black text-white rounded px-3 py-2 text-sm">
            新しいチケット
          </Link>
        </div>
      </div>

      {visibleQueries.length > 0 && (
        <nav className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">保存済みクエリ:</span>
          <Link href={`/projects/${identifier}/issues`} className={!queryId ? "font-semibold underline" : "underline"}>
            (絞り込みなし)
          </Link>
          {visibleQueries.map((query) => (
            <Link
              key={query.id}
              href={`/projects/${identifier}/issues?query_id=${query.id}`}
              className={queryId === query.id ? "font-semibold underline" : "underline"}
            >
              {query.name}
            </Link>
          ))}
        </nav>
      )}

      <form method="get" className="flex items-center gap-2 text-sm">
        <label htmlFor="status_id">ステータスで絞り込み:</label>
        <select id="status_id" name="status_id" defaultValue={statusFilter ?? ""} className="border rounded px-2 py-1">
          <option value="">(すべて)</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
        <button type="submit" className="border rounded px-2 py-1">
          適用
        </button>
      </form>

      {appliedFilters.length > 0 && (
        <SaveQueryForm
          projectIdentifier={identifier}
          filters={appliedFilters}
          canPublish={can({ permission: "edit_issues", project: toAuthorizationProject(project), actor })}
        />
      )}

      <form method="get" action={`/projects/${identifier}/issues/bulk-edit`} className="flex flex-col gap-3">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-4 py-1" />
              <th className="pr-4 py-1">#</th>
              <th className="pr-4 py-1">トラッカー</th>
              <th className="pr-4 py-1">件名</th>
              <th className="pr-4 py-1">ステータス</th>
              <th className="pr-4 py-1">進捗率</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id} className="border-b">
                <td className="pr-4 py-1">
                  <input type="checkbox" name="ids" value={issue.id} />
                </td>
                <td className="pr-4 py-1">
                  <Link href={`/projects/${identifier}/issues/${issue.id}`} className="underline">
                    {issue.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="pr-4 py-1">{trackerById.get(issue.trackerId)?.name ?? "?"}</td>
                <td className="pr-4 py-1">{issue.subject}</td>
                <td className="pr-4 py-1">{statusById.get(issue.statusId)?.name ?? "?"}</td>
                <td className="pr-4 py-1">{issue.doneRatio}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="border rounded px-3 py-2 text-sm self-start">
          選択したチケットを編集
        </button>
      </form>
    </main>
  );
}
