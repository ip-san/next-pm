import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { computeVersionProgress } from "@/domain/version/progress";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

/** Mirrors VersionsController#index: shared/rolled-up versions grouped with their fixed issues, sorted open-first by due date. */
export default async function RoadmapPage({ params }: { params: Promise<{ identifier: string }> }) {
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

  const [versions, allIssues, statuses] = await Promise.all([
    new DrizzleVersionRepository().listSharedWith(project.id),
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  const issues = allIssues.filter(visibleIssueFilter(user?.id ?? null, actor));
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  const openVersions = versions
    .filter((version) => version.status === "open")
    .sort((a, b) => (a.effectiveDate ?? "9999-99-99").localeCompare(b.effectiveDate ?? "9999-99-99"));

  return (
    <main className="p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ロードマップ</h1>
        <Link href={`/projects/${identifier}/versions`} className="text-sm underline">
          バージョン管理
        </Link>
      </div>

      {openVersions.map((version) => {
        const versionIssues = issues.filter((issue) => issue.fixedVersionId === version.id);
        const progress = computeVersionProgress(
          versionIssues.map((issue) => ({ isClosed: statusById.get(issue.statusId)?.isClosed ?? false, doneRatio: issue.doneRatio })),
        );
        return (
          <section key={version.id} className="flex flex-col gap-3">
            <div>
              <h2 className="font-medium">{version.name}</h2>
              <p className="text-xs text-gray-500">
                期日: {version.effectiveDate ?? "未定"} · 未完了 {progress.openCount}件 · 完了 {progress.closedCount}件
              </p>
              <div className="w-full max-w-sm h-2 rounded bg-gray-200 mt-1">
                <div className="h-2 rounded bg-black" style={{ width: `${Math.round(progress.completedPercent)}%` }} />
              </div>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {versionIssues.map((issue) => (
                <li key={issue.id}>
                  <Link href={`/projects/${identifier}/issues/${issue.id}`} className="underline">
                    #{issue.id.slice(0, 8)} {issue.subject}
                  </Link>
                  <span className="text-gray-500 text-xs"> — {statusById.get(issue.statusId)?.name ?? "?"}</span>
                </li>
              ))}
              {versionIssues.length === 0 ? <li className="text-gray-400 text-xs">チケットはありません。</li> : null}
            </ul>
          </section>
        );
      })}
      {openVersions.length === 0 ? <p className="text-sm text-gray-500">進行中のバージョンはありません。</p> : null}
    </main>
  );
}
