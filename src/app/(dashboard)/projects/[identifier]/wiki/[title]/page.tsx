import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { ancestorChain, childrenOf } from "@/domain/wiki/hierarchy";
import { expandMacros, extractHeadings } from "@/domain/wiki/macros";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DeleteWikiAttachmentButton } from "./delete-wiki-attachment-button";
import { WikiAttachmentUploadForm } from "./wiki-attachment-upload-form";
import { WikiProtectToggleForm } from "./wiki-protect-toggle-form";
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
  const projectContext = toAuthorizationProject(project);
  const canExport = can({ permission: "export_wiki_pages", project: projectContext, actor });
  const canProtect = can({ permission: "protect_wiki_pages", project: projectContext, actor });
  const canViewEdits = can({ permission: "view_wiki_edits", project: projectContext, actor });
  const canDelete = can({ permission: "delete_wiki_pages", project: projectContext, actor });
  const canDeleteAttachments = can({ permission: "delete_wiki_pages_attachments", project: projectContext, actor });
  const canRenameOrManage =
    can({ permission: "rename_wiki_pages", project: projectContext, actor }) ||
    can({ permission: "manage_wiki", project: projectContext, actor });

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const wikiContentRepository = new DrizzleWikiContentRepository();
  const resolved = await resolveWikiPage(
    { wikiPageRepository, wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (resolved?.redirected) {
    redirect(`/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}`);
  }
  const wikiPage = resolved?.page ?? null;
  // Redmine's WikiController#editable? — edit_wiki_pages gets you to the form, but a protected
  // page additionally needs protect_wiki_pages (WikiPage#editable_by?). A page that does not
  // exist yet cannot be protected.
  const canEdit =
    can({ permission: "edit_wiki_pages", project: projectContext, actor }) &&
    (wikiPage === null || isWikiPageEditable(wikiPage, canProtect));
  const current = wikiPage ? await wikiContentRepository.findCurrent(wikiPage.id) : null;
  const attachments = wikiPage ? await new DrizzleAttachmentRepository().listByContainer("WikiPage", wikiPage.id) : [];
  const isWatching =
    user && wikiPage ? await new DrizzleWatcherRepository().isWatching("WikiPage", wikiPage.id, user.id) : false;

  const allPages = wikiPage ? await wikiPageRepository.listForProject(project.id) : [];
  const children = wikiPage ? childrenOf(allPages, wikiPage.id) : [];
  const ancestors = wikiPage ? ancestorChain(allPages, wikiPage) : [];

  let renderedText = current?.text ?? "";
  if (current && wikiPage) {
    const childPages = children.map((page) => ({ title: page.title }));
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
      {/* Redmine's wiki_page_breadcrumb: the ancestor trail, root first. */}
      <nav className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
        <Link href={`/projects/${identifier}/wiki/index`} className="underline">
          目次
        </Link>
        {ancestors.map((ancestor) => (
          <span key={ancestor.id} className="flex items-center gap-1">
            <span aria-hidden>»</span>
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(ancestor.title)}`} className="underline">
              {ancestor.title}
            </Link>
          </span>
        ))}
      </nav>

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
          {canProtect && wikiPage ? (
            <WikiProtectToggleForm
              pageId={wikiPage.id}
              projectIdentifier={identifier}
              title={title}
              isProtected={wikiPage.isProtected}
            />
          ) : null}
          {canRenameOrManage && wikiPage && isWikiPageEditable(wikiPage, canProtect) ? (
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/rename`} className="text-sm underline">
              名前を変更
            </Link>
          ) : null}
          {canDelete && wikiPage && isWikiPageEditable(wikiPage, canProtect) ? (
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/destroy`} className="text-sm underline text-red-600">
              削除
            </Link>
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
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <span>バージョン {current.version}</span>
            {canViewEdits ? (
              <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/history`} className="underline">
                履歴を見る
              </Link>
            ) : null}
            {wikiPage?.isProtected ? <span className="border rounded px-1 text-gray-600">保護中</span> : null}
          </p>

          {children.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">子ページ</h2>
              <ul className="flex flex-col gap-1 pl-4 list-disc text-sm">
                {children.map((child) => (
                  <li key={child.id}>
                    <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(child.title)}`} className="underline">
                      {child.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="font-medium text-sm">添付ファイル</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2">
                  <a href={`/api/attachments/${attachment.id}`} className="underline">
                    {attachment.filename}
                  </a>
                  {canDeleteAttachments && wikiPage && isWikiPageEditable(wikiPage, canProtect) ? (
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
