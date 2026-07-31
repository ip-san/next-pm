import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { computeVersionProgress } from "@/domain/version/progress";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { VersionCreateForm } from "./version-create-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { open: "進行中", locked: "ロック中", closed: "終了" };
const SHARING_LABEL: Record<string, string> = {
  none: "共有しない",
  descendants: "サブプロジェクト",
  hierarchy: "プロジェクト階層",
  tree: "プロジェクトツリー",
  system: "全プロジェクト",
};

export default async function VersionsPage({ params }: { params: Promise<{ identifier: string }> }) {
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
  const canManageVersions = can({ permission: "manage_versions", project: toAuthorizationProject(project), actor });

  const [versions, issues, statuses] = await Promise.all([
    new DrizzleVersionRepository().listByProject(project.id),
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">バージョン</h1>
        <Link href={`/projects/${identifier}/roadmap`} className="text-sm underline">
          ロードマップを見る
        </Link>
      </div>

      <table className="text-sm w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-2">名前</th>
            <th className="pb-2">期日</th>
            <th className="pb-2">状態</th>
            <th className="pb-2">共有</th>
            <th className="pb-2">進捗</th>
            {canManageVersions ? <th className="pb-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const versionIssues = issues.filter((issue) => issue.fixedVersionId === version.id);
            const progress = computeVersionProgress(
              versionIssues.map((issue) => ({ isClosed: statusById.get(issue.statusId)?.isClosed ?? false, doneRatio: issue.doneRatio })),
            );
            return (
              <tr key={version.id} className="border-b">
                <td className="py-2">{version.name}</td>
                <td className="py-2">{version.effectiveDate ?? "-"}</td>
                <td className="py-2">{STATUS_LABEL[version.status]}</td>
                <td className="py-2">{SHARING_LABEL[version.sharing]}</td>
                <td className="py-2">{Math.round(progress.completedPercent)}%</td>
                {canManageVersions ? (
                  <td className="py-2">
                    <Link href={`/projects/${identifier}/versions/${version.id}`} className="underline">
                      編集
                    </Link>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canManageVersions ? <VersionCreateForm projectIdentifier={identifier} /> : null}
    </main>
  );
}
