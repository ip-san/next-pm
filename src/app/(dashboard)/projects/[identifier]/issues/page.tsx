import Link from "next/link";
import { notFound } from "next/navigation";
import { compileFilters } from "@/domain/query/filter-builder";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";

export default async function ProjectIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ status_id?: string }>;
}) {
  const { identifier } = await params;
  const { status_id: statusFilter } = await searchParams;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const predicates = statusFilter
    ? compileFilters([{ field: "status_id", operator: "=", values: [statusFilter] }])
    : [];

  const [issues, statuses, trackers] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id, predicates),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — チケット</h1>
        <Link href={`/projects/${identifier}/issues/new`} className="bg-black text-white rounded px-3 py-2 text-sm">
          新しいチケット
        </Link>
      </div>

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

      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
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
    </main>
  );
}
