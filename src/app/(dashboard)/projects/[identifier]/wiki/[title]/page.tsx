import { findIssuesByReference } from "@/application/issues/find-issues-by-reference";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { filterMembersWithPermission } from "@/domain/member/entity";
import { ancestorChain, childrenOf } from "@/domain/wiki/hierarchy";
import { collectIssueRefs, parseWikiBlocks, type ResolvedIssue, type WikiBlock } from "@/domain/wiki/macro-blocks";
import { expandMacros, extractHeadings } from "@/domain/wiki/macros";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { AttachmentList } from "../../../attachment-list";
import { DeleteWikiAttachmentButton } from "./delete-wiki-attachment-button";
import { WikiAttachmentUploadForm } from "./wiki-attachment-upload-form";
import { WikiContent } from "./wiki-content";
import { WikiProtectToggleForm } from "./wiki-protect-toggle-form";
import { WikiWatcherManager } from "./wiki-watcher-manager";
import { WikiWatchToggleForm } from "./wiki-watch-toggle-form";

export default async function WikiPageView({
  params,
}: {
  params: Promise<{ identifier: string; title: string }>;
}) {
  const locale = await currentLocale();
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
  const canViewWatchers = can({ permission: "view_wiki_page_watchers", project: projectContext, actor });
  const canAddWatchers = can({ permission: "add_wiki_page_watchers", project: projectContext, actor });
  const canRemoveWatchers = can({ permission: "delete_wiki_page_watchers", project: projectContext, actor });
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

  // Redmine's show.html.erb renders the watcher box when the actor can add watchers, or
  // when there are watchers to show and the actor can view them.
  const watcherUserIds =
    wikiPage && (canViewWatchers || canAddWatchers)
      ? await new DrizzleWatcherRepository().listWatcherUserIds("WikiPage", wikiPage.id)
      : [];
  const showWatchers = wikiPage !== null && (canAddWatchers || (watcherUserIds.length > 0 && canViewWatchers));
  // Principal.assignable_watchers: members who can actually read this wiki.
  const watcherCandidateMembers = showWatchers && canAddWatchers ? await assignableWatchers(project.id) : [];
  const watcherUsers = showWatchers
    ? await new DrizzleUserRepository().findByIds([
        ...new Set([...watcherUserIds, ...watcherCandidateMembers]),
      ])
    : [];
  const watcherLabelById = new Map(watcherUsers.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));

  const allPages = wikiPage ? await wikiPageRepository.listForProject(project.id) : [];
  const children = wikiPage ? childrenOf(allPages, wikiPage.id) : [];
  const ancestors = wikiPage ? ancestorChain(allPages, wikiPage) : [];

  let blocks: WikiBlock[] = [];
  if (current && wikiPage) {
    const childPages = children.map((page) => ({ title: page.title }));
    const textByTitle = new Map<string, string>();
    for (const page of allPages) {
      const version = await wikiContentRepository.findCurrent(page.id);
      if (version) {
        textByTitle.set(page.title, version.text);
      }
    }
    const expanded = expandMacros(
      current.text,
      {
        headings: extractHeadings(current.text),
        childPages,
        resolveInclude: (includeTitle) => textByTitle.get(includeTitle) ?? null,
      },
      new Set([title]),
    );

    // {{recent_pages}} is relative to the moment the page renders.
    const now = new Date().getTime();
    // The macro pass is synchronous, so everything it can look up is fetched first.
    const issueByPrefix = await resolveMacroIssues(collectIssueRefs(expanded), user);
    const currentByPage = await wikiContentRepository.listCurrentByProject(project.id);
    blocks = parseWikiBlocks(expanded, {
      // Redmine's Attachment.latest_attach: the page's own attachments only, newest wins.
      findAttachment: (filename) =>
        attachments
          .filter((attachment) => attachment.filename === filename)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      resolveIssue: (prefix) => issueByPrefix.get(prefix) ?? null,
      // Scoped to this project, which the viewer already holds view_wiki_pages for.
      recentPages: ({ days, limit }) => {
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        const recent = currentByPage
          .filter((entry) => entry.version.createdAt.getTime() >= cutoff)
          .sort((a, b) => b.version.createdAt.getTime() - a.version.createdAt.getTime())
          .map((entry) => ({ title: entry.page.title, updatedAt: entry.version.createdAt }));
        return limit === null ? recent : recent.slice(0, limit);
      },
    });
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      {/* Redmine's wiki_page_breadcrumb: the ancestor trail, root first. */}
      <nav className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
        <Link href={`/projects/${identifier}/wiki/index`} className="underline">
          {translate(locale, "wiki.index")}
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
            <WikiWatchToggleForm pageId={wikiPage.id} title={title} projectIdentifier={identifier} isWatching={isWatching} locale={locale} />
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
              locale={locale}
            />
          ) : null}
          {canRenameOrManage && wikiPage && isWikiPageEditable(wikiPage, canProtect) ? (
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/rename`} className="text-sm underline">
              {translate(locale, "wiki.rename")}
            </Link>
          ) : null}
          {canDelete && wikiPage && isWikiPageEditable(wikiPage, canProtect) ? (
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/destroy`} className="text-sm underline text-red-600">
              {translate(locale, "issue.delete")}
            </Link>
          ) : null}
          {canEdit ? (
            <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/edit`} className="bg-black text-white rounded px-3 py-2 text-sm">
              {translate(locale, "issue.edit")}
            </Link>
          ) : null}
        </div>
      </div>

      {current ? (
        <>
          <WikiContent blocks={blocks} identifier={identifier} project={{ id: project.id, identifier }} locale={locale} />
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <span>{interpolate(translate(locale, "wiki.version"), { version: current.version })}</span>
            {canViewEdits ? (
              <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/history`} className="underline">
                {translate(locale, "wiki.history")}
              </Link>
            ) : null}
            {wikiPage?.isProtected ? <span className="border rounded px-1 text-gray-600">{translate(locale, "wiki.protected")}</span> : null}
          </p>

          {children.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-medium text-sm">{translate(locale, "wiki.childPages")}</h2>
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

          {showWatchers && wikiPage ? (
            <WikiWatcherManager
              pageId={wikiPage.id}
              title={title}
              projectIdentifier={identifier}
              watchers={watcherUserIds.map((id) => ({ id, label: watcherLabelById.get(id) ?? id }))}
              candidates={watcherCandidateMembers
                .filter((id) => !watcherUserIds.includes(id))
                .map((id) => ({ id, label: watcherLabelById.get(id) ?? id }))}
              canAdd={canAddWatchers}
              canRemove={canRemoveWatchers}
              locale={locale}
            />
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="font-medium text-sm">{translate(locale, "issue.attachments")}</h2>
            {/* Files' shared AttachmentList, with the wiki branch's delete gate: deleting an
                attachment needs delete_wiki_pages_attachments *and* the page to be editable,
                so a protected page's attachments can't be removed around the protection. */}
            <AttachmentList
              attachments={attachments}
              locale={locale}
              renderAction={
                canDeleteAttachments && wikiPage && isWikiPageEditable(wikiPage, canProtect)
                  ? (attachment) => (
                      <DeleteWikiAttachmentButton projectIdentifier={identifier} title={title} attachmentId={attachment.id} locale={locale} />
                    )
                  : undefined
              }
            />
            {canEdit && wikiPage ? (
              <WikiAttachmentUploadForm pageId={wikiPage.id} projectIdentifier={identifier} title={title} locale={locale} />
            ) : null}
          </section>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          {translate(locale, "wiki.notExist")}
          {canEdit ? (
            <>
              {" "}
              <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/edit`} className="underline">
                {translate(locale, "wiki.create")}
              </Link>
            </>
          ) : null}
        </p>
      )}
    </main>
  );
}

/** Redmine's Principal.assignable_watchers for a wiki page: members who can view the wiki. */
async function assignableWatchers(projectId: string): Promise<string[]> {
  const members = await new DrizzleMemberRepository().listByProject(projectId);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
  );
  return filterMembersWithPermission(members, rolesById, "view_wiki_pages")
    .map((member) => member.userId)
    .filter((userId): userId is string => userId !== null);
}

/**
 * Resolves {{issue(...)}} references for the macro pass. An issue the viewer may not see —
 * wrong project, no view_issues, or a private issue outside their reach — resolves to nothing,
 * so the macro falls back to a bare "#id" and never leaks a subject. An ambiguous id prefix
 * matching more than one issue is treated the same way.
 */
async function resolveMacroIssues(
  prefixes: string[],
  user: Awaited<ReturnType<typeof currentUserFromCookies>>,
): Promise<Map<string, ResolvedIssue>> {
  const resolved = new Map<string, ResolvedIssue>();
  if (prefixes.length === 0) {
    return resolved;
  }

  const issueRepository = new DrizzleIssueRepository();
  const projectRepository = new DrizzleProjectRepository();
  const trackerRepository = new DrizzleTrackerRepository();

  for (const prefix of prefixes) {
    // A macro names an issue by its number ({{issue(42)}}) or by the older 8-hex id prefix.
    if (!/^(?:[1-9]\d*|[0-9a-f]{1,8})$/i.test(prefix)) {
      continue;
    }
    const matches = await findIssuesByReference(issueRepository, prefix);
    if (matches.length !== 1) {
      continue;
    }
    const issue = matches[0];

    const issueProject = await projectRepository.findById(issue.projectId);
    if (!issueProject) {
      continue;
    }
    const { actor: issueActor, userGroupIds } = await resolveActor(user, issueProject.id);
    if (!can({ permission: "view_issues", project: toAuthorizationProject(issueProject), actor: issueActor })) {
      continue;
    }
    if (!isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(issueActor))) {
      continue;
    }

    const tracker = await trackerRepository.findById(issue.trackerId);
    resolved.set(prefix, {
      id: issue.id,
      idPrefix: issue.id.slice(0, 8),
      trackerName: tracker?.name ?? "",
      subject: issue.subject,
      projectName: issueProject.name,
      projectIdentifier: issueProject.identifier,
    });
  }

  return resolved;
}
