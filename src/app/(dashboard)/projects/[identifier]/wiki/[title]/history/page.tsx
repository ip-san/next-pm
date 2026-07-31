import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export default async function WikiHistoryPage({
  params,
}: {
  params: Promise<{ identifier: string; title: string }>;
}) {
  const { identifier, title: rawTitle } = await params;
  const title = decodeURIComponent(rawTitle);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const wikiPage = await new DrizzleWikiPageRepository().findByTitle(project.id, title);
  if (!wikiPage) {
    notFound();
  }
  const versions = await new DrizzleWikiContentRepository().listVersions(wikiPage.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{title} — 履歴</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {versions.map((version, index) => (
          <li key={version.id} className="border rounded p-2 flex items-center justify-between">
            <span>
              バージョン {version.version} · {version.createdAt.toISOString()}
              {version.comments ? ` — ${version.comments}` : ""}
            </span>
            {index + 1 < versions.length ? (
              <Link
                href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/diff?from=${versions[index + 1].version}&to=${version.version}`}
                className="underline"
              >
                前バージョンとの差分
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
