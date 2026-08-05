import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { expandMacros, extractHeadings } from "@/domain/wiki/macros";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DeleteWikiAttachmentButton } from "./delete-wiki-attachment-button";
import { WikiAttachmentUploadForm } from "./wiki-attachment-upload-form";
import { WikiWatchToggleForm } from "./wiki-watch-toggle-form";

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
  const canExport = can({ permission: "export_wiki_pages", project: toAuthorizationProject(project), actor });

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const wikiContentRepository = new DrizzleWikiContentRepository();
  const wikiPage = await wikiPageRepository.findByTitle(project.id, title);
  const current = wikiPage ? await wikiContentRepository.findCurrent(wikiPage.id) : null;
  const attachments = wikiPage ? await new DrizzleAttachmentRepository().listByContainer("WikiPage", wikiPage.id) : [];
  const isWatching =
    user && wikiPage ? await new DrizzleWatcherRepository().isWatching("WikiPage", wikiPage.id, user.id) : false;

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
        <div className="flex items-center gap-3">
          {user && wikiPage ? (
            <WikiWatchToggleForm pageId={wikiPage.id} title={title} projectIdentifier={identifier} isWatching={isWatching} />
          ) : null}
          {canExport ? (
            <>
              <a href={`/api/projects/${identifier}/wiki/export/html`} className="text-sm underline">
                HTML
              </a>
              <a href={`/api/projects/${identifier}/wiki/export/pdf`} className="text-sm underline">
                PDF
              </a>
              <a href={`/api/projects/${identifier}/wiki/export/zip`} className="text-sm underline">
                ZIP
              </a>
            </>
          ) : null}
          {canEdit ? (
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/edit`} className="bg-black text-white rounded px-3 py-2 text-sm">
              編集
            </Link>
          ) : null}
        </div>
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

          <section className="flex flex-col gap-2">
            <h2 className="font-medium text-sm">添付ファイル</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2">
                  <a href={`/api/attachments/${attachment.id}`} className="underline">
                    {attachment.filename}
                  </a>
                  {canEdit ? (
                    <DeleteWikiAttachmentButton projectIdentifier={identifier} title={title} attachmentId={attachment.id} />
                  ) : null}
                </li>
              ))}
              {attachments.length === 0 ? <li className="text-gray-400 text-xs">添付ファイルはありません。</li> : null}
            </ul>
            {canEdit && wikiPage ? (
              <WikiAttachmentUploadForm pageId={wikiPage.id} projectIdentifier={identifier} title={title} />
            ) : null}
          </section>
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
