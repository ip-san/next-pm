import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { expandMacros, extractHeadings } from "@/domain/wiki/macros";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export default async function WikiPageView({
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
  const canEdit = can({ permission: "edit_wiki_pages", project: toAuthorizationProject(project), actor });

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const wikiContentRepository = new DrizzleWikiContentRepository();
  const wikiPage = await wikiPageRepository.findByTitle(project.id, title);
  const current = wikiPage ? await wikiContentRepository.findCurrent(wikiPage.id) : null;

  let renderedText = current?.text ?? "";
  if (current && wikiPage) {
    const allPages = await wikiPageRepository.listForProject(project.id);
    const childPages = allPages.filter((page) => page.parentId === wikiPage.id).map((page) => ({ title: page.title }));
    const textByTitle = new Map<string, string>();
    for (const page of allPages) {
      const version = await wikiContentRepository.findCurrent(page.id);
      if (version) {
        textByTitle.set(page.title, version.text);
      }
    }
    renderedText = expandMacros(
      current.text,
      {
        headings: extractHeadings(current.text),
        childPages,
        resolveInclude: (includeTitle) => textByTitle.get(includeTitle) ?? null,
      },
      new Set([title]),
    );
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        {canEdit ? (
          <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/edit`} className="bg-black text-white rounded px-3 py-2 text-sm">
            編集
          </Link>
        ) : null}
      </div>

      {current ? (
        <>
          <p className="whitespace-pre-wrap text-sm">{renderedText}</p>
          <p className="text-xs text-gray-500">
            バージョン {current.version} ·{" "}
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/history`} className="underline">
              履歴を見る
            </Link>
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          このページはまだ存在しません。
          {canEdit ? (
            <>
              {" "}
              <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/edit`} className="underline">
                作成する
              </Link>
            </>
          ) : null}
        </p>
      )}
    </main>
  );
}
