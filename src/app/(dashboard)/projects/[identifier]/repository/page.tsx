import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { RepositoryBrowseView } from "../repository/repository-views";

export const dynamic = "force-dynamic";

/**
 * The project's default repository, at Redmine's bare `projects/:id/repository` path. Named
 * repositories live one segment deeper, under `[repositoryId]`.
 *
 * Redmine hides the Repository menu item entirely until a project has a repository, so its
 * equivalent of this page is simply unreachable while empty. next-pm shows the menu item
 * unconditionally, so this renders an empty state (pointing `manage_repository` holders at the
 * settings tab) instead of a 404 the user has no way to act on.
 */
export default async function RepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ path?: string; ref?: string }>;
}) {
  const { identifier } = await params;
  const { path, ref } = await searchParams;

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

  const repositories = await new DrizzleScmRepositoryRepository().listByProject(project.id);
  if (repositories.length === 0) {
    const canManage = can({ permission: "manage_repository", project: projectContext, actor });
    return (
      <main className="p-8 flex flex-col gap-6">
        <h1 className="text-xl font-semibold">リポジトリ</h1>
        <p className="text-sm text-gray-500">このプロジェクトにはリポジトリが設定されていません。</p>
        {canManage ? (
          <Link href={`/projects/${identifier}/repositories`} className="underline text-sm self-start">
            リポジトリを追加する
          </Link>
        ) : null}
      </main>
    );
  }

  return <RepositoryBrowseView projectIdentifier={identifier} path={path} revision={ref} />;
}
