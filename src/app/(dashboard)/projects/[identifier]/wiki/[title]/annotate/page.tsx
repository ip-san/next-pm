import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { annotateWikiContent } from "@/domain/wiki/annotate";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/**
 * Mirrors WikiController#annotate: each line of a version shown next to the version that
 * introduced it. Gated by view_wiki_edits, like history and diff.
 */
export default async function WikiAnnotatePage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string; title: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { identifier, title: rawTitle } = await params;
  const { version: rawVersion } = await searchParams;
  const title = decodeURIComponent(rawTitle);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_edits", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const resolved = await resolveWikiPage(
    { wikiPageRepository: new DrizzleWikiPageRepository(), wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (!resolved) {
    notFound();
  }
  if (resolved.redirected) {
    redirect(`/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}/annotate`);
  }

  // listVersions is newest-first; annotateWikiContent walks history forwards.
  const ascending = (await new DrizzleWikiContentRepository().listVersions(resolved.page.id)).reverse();
  if (ascending.length === 0) {
    notFound();
  }
  // No ?version= annotates the current one, as Redmine's `version ? ... : content.version` does.
  const target = rawVersion === undefined ? ascending[ascending.length - 1].version : Number(rawVersion);
  const targetIndex = ascending.findIndex((entry) => entry.version === target);
  if (targetIndex === -1) {
    notFound();
  }

  const lines = annotateWikiContent(ascending.slice(0, targetIndex + 1));
  const authors = await new DrizzleUserRepository().findByIds([...new Set(lines.map((line) => line.authorId))]);
  const authorById = new Map(authors.map((author) => [author.id, `${author.lastname} ${author.firstname}`]));

  return (
    <main className="p-8 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">
        {resolved.page.title} — 注釈付き (バージョン {target})
      </h1>
      <p className="text-xs text-gray-500 flex gap-3">
        <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}`} className="underline">
          ページに戻る
        </Link>
        <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}/history`} className="underline">
          履歴
        </Link>
      </p>
      <table className="text-sm font-mono border-collapse">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="align-top">
              <td className="border-r pr-2 text-right text-gray-400 select-none">{index + 1}</td>
              <td className="border-r px-2 text-gray-500 whitespace-nowrap">v{line.version}</td>
              <td className="border-r px-2 text-gray-500 whitespace-nowrap">{authorById.get(line.authorId) ?? "-"}</td>
              <td className="pl-2 whitespace-pre-wrap">{line.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
