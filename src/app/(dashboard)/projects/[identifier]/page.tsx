import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const NAV_LINKS: { module: string; path: string; label: string }[] = [
  { module: "issue_tracking", path: "issues", label: "チケット" },
  { module: "issue_tracking", path: "roadmap", label: "ロードマップ" },
  { module: "time_tracking", path: "time-entries", label: "工数" },
  { module: "wiki", path: "wiki", label: "Wiki" },
  { module: "boards", path: "boards", label: "フォーラム" },
  { module: "news", path: "news", label: "ニュース" },
  { module: "documents", path: "documents", label: "ドキュメント" },
  { module: "repository", path: "repository", label: "リポジトリ" },
];

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const canEditProject = can({ permission: "edit_project", project: toAuthorizationProject(project), actor });

  return (
    <main className="p-8 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{project.name}</h1>
      <nav className="flex gap-3 text-sm">
        {NAV_LINKS.filter((link) => project.enabledModules.includes(link.module)).map((link) => (
          <Link key={link.path} href={`/projects/${identifier}/${link.path}`} className="underline">
            {link.label}
          </Link>
        ))}
        <Link href={`/projects/${identifier}/search`} className="underline">
          検索
        </Link>
        {canEditProject ? (
          <Link href={`/projects/${identifier}/settings`} className="underline">
            設定
          </Link>
        ) : null}
      </nav>
      <p className="text-sm text-gray-600">{project.description}</p>
      <dl className="text-sm flex flex-col gap-1">
        <div>
          <dt className="inline font-medium">識別子: </dt>
          <dd className="inline">{project.identifier}</dd>
        </div>
        <div>
          <dt className="inline font-medium">公開: </dt>
          <dd className="inline">{project.isPublic ? "はい" : "いいえ"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">有効なモジュール: </dt>
          <dd className="inline">{project.enabledModules.join(", ") || "(なし)"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">nested set: </dt>
          <dd className="inline">
            lft={project.lft}, rgt={project.rgt}
          </dd>
        </div>
      </dl>
    </main>
  );
}
