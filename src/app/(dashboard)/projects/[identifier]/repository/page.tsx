import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { InvalidRefError, InvalidRepositoryPathError } from "@/domain/scm/validate-path";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { scmBrowserFor } from "@/infrastructure/scm/browser-for-vendor";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ConnectRepositoryForm } from "./connect-repository-form";
import { SyncRepositoryButton } from "./sync-repository-button";

export const dynamic = "force-dynamic";

export default async function RepositoryPage({
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
  const canManage = can({ permission: "manage_repository", project: projectContext, actor });
  const canViewChangesets = can({ permission: "view_changesets", project: projectContext, actor });

  const scmRepository = await new DrizzleScmRepositoryRepository().findByProject(project.id);

  if (!scmRepository) {
    return (
      <main className="p-8 flex flex-col gap-6">
        <h1 className="text-xl font-semibold">リポジトリ</h1>
        <p className="text-sm text-gray-500">このプロジェクトにはリポジトリが設定されていません。</p>
        {canManage ? <ConnectRepositoryForm projectIdentifier={identifier} /> : null}
      </main>
    );
  }

  const browser = scmBrowserFor(scmRepository.vendor);
  let entries: Awaited<ReturnType<typeof browser.listTree>> = [];
  let commits: Awaited<ReturnType<typeof browser.log>> = [];
  let fileContent: string | null = null;
  let error: string | null = null;
  try {
    entries = await browser.listTree(scmRepository.rootPath, currentRef, currentPath);
  } catch (listError) {
    if (listError instanceof InvalidRefError || listError instanceof InvalidRepositoryPathError) {
      error = listError.message;
    } else {
      // Not a tree — try it as a file instead of giving up.
      try {
        fileContent = await browser.readFile(scmRepository.rootPath, currentRef, currentPath);
      } catch {
        error = "パスまたはリビジョンが見つかりません。";
      }
    }
  }
  if (!error && canViewChangesets) {
    try {
      commits = await browser.log(scmRepository.rootPath, currentRef, 10);
    } catch {
      // Log failure shouldn't block showing the tree/file above.
    }
  }

  const parentPath = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">リポジトリ</h1>
      <p className="text-sm text-gray-500">
        {currentRef} — /{currentPath}
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {fileContent !== null ? (
        <>
          <Link
            href={`/projects/${identifier}/repository/blame?path=${encodeURIComponent(currentPath)}&ref=${encodeURIComponent(currentRef)}`}
            className="underline text-sm self-start"
          >
            変更履歴を見る (blame)
          </Link>
          <pre className="text-xs font-mono border rounded p-3 overflow-x-auto whitespace-pre">{fileContent}</pre>
        </>
      ) : (
        <ul className="flex flex-col gap-1 text-sm font-mono">
          {currentPath.length > 0 ? (
            <li>
              <Link href={`/projects/${identifier}/repository?path=${encodeURIComponent(parentPath)}&ref=${encodeURIComponent(currentRef)}`} className="underline">
                ..
              </Link>
            </li>
          ) : null}
          {entries.map((entry) => (
            <li key={entry.path}>
              <Link
                href={`/projects/${identifier}/repository?path=${encodeURIComponent(entry.path)}&ref=${encodeURIComponent(currentRef)}`}
                className="underline"
              >
                {entry.kind === "tree" ? "📁" : "📄"} {entry.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canViewChangesets ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">最近のコミット</h2>
            {canManage ? <SyncRepositoryButton projectIdentifier={identifier} /> : null}
          </div>
          <ul className="flex flex-col gap-1 text-xs">
            {commits.map((commit) => (
              <li key={commit.hash} className="border-b pb-1">
                <Link href={`/projects/${identifier}/repository/revisions/${commit.hash}`} className="font-mono underline">
                  {commit.hash.slice(0, 8)}
                </Link>{" "}
                {commit.message.split("\n")[0]} — {commit.author}, {commit.date}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
