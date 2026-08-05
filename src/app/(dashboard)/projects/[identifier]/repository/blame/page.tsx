import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { InvalidRefError, InvalidRepositoryPathError } from "@/domain/scm/validate-path";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { scmBrowserFor } from "@/infrastructure/scm/browser-for-vendor";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

export default async function BlamePage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ path?: string; ref?: string }>;
}) {
  const { identifier } = await params;
  const { path, ref } = await searchParams;
  const currentPath = path ?? "";
  const currentRef = ref ?? "HEAD";

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "browse_repository", project: projectContext, actor })) {
    notFound();
  }
  const canViewChangesets = can({ permission: "view_changesets", project: projectContext, actor });

  const scmRepository = await new DrizzleScmRepositoryRepository().findByProject(project.id);
  if (!scmRepository || currentPath.length === 0) {
    notFound();
  }

  const browser = scmBrowserFor(scmRepository.vendor);
  let lines: Awaited<ReturnType<typeof browser.blame>> = [];
  let error: string | null = null;
  try {
    lines = await browser.blame(scmRepository.rootPath, currentRef, currentPath);
  } catch (blameError) {
    error = blameError instanceof InvalidRefError || blameError instanceof InvalidRepositoryPathError ? blameError.message : "対象が見つかりません。";
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold font-mono">{currentPath} の変更履歴</h1>
        <Link
          href={`/projects/${identifier}/repository?path=${encodeURIComponent(currentPath)}&ref=${encodeURIComponent(currentRef)}`}
          className="underline text-sm"
        >
          ファイルを見る
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <table className="text-xs font-mono border-collapse w-full">
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineNumber} className="align-top">
                <td className="pr-2 text-gray-400 text-right select-none">{line.lineNumber}</td>
                <td className="pr-3 whitespace-nowrap text-gray-600">
                  {canViewChangesets ? (
                    <Link href={`/projects/${identifier}/repository/revisions/${line.commitHash}`} className="underline">
                      {line.commitHash.slice(0, 8)}
                    </Link>
                  ) : (
                    line.commitHash.slice(0, 8)
                  )}{" "}
                  {line.author} {line.date}
                </td>
                <td className="whitespace-pre">{line.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
