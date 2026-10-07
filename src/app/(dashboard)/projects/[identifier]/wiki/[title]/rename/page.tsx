import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DEFAULT_WIKI_START_PAGE } from "@/domain/wiki/entity";
import { selfAndDescendantIds } from "@/domain/wiki/hierarchy";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import {
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
  DrizzleWikiRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { WikiRenameForm } from "./wiki-rename-form";

export default async function WikiRenamePage({
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
  const projectContext = toAuthorizationProject(project);
  // wiki#rename is mapped to rename_wiki_pages *and* manage_wiki (preparation.rb#L128,#L135),
  // but only rename_wiki_pages makes title and parent_id safe attributes.
  const canReparent = can({ permission: "rename_wiki_pages", project: projectContext, actor });
  const canSetStartPage = can({ permission: "manage_wiki", project: projectContext, actor });
  const canRename = canReparent || canSetStartPage;
  if (!canRename) {
    notFound();
  }

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const resolved = await resolveWikiPage(
    { wikiPageRepository, wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (!resolved) {
    notFound();
  }
  if (!isWikiPageEditable(resolved.page, can({ permission: "protect_wiki_pages", project: projectContext, actor }))) {
    notFound();
  }

  // Redmine's rename form offers `@wiki.pages - @page.self_and_descendants` as the parent.
  const wiki = await new DrizzleWikiRepository().findByProject(project.id);
  const pages = await wikiPageRepository.listForProject(project.id);
  const excluded = selfAndDescendantIds(pages, resolved.page.id);
  const parentCandidates = pages
    .filter((candidate) => !excluded.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, title: candidate.title }));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{resolved.page.title} の名前を変更</h1>
      <WikiRenameForm
        pageId={resolved.page.id}
        projectIdentifier={identifier}
        title={resolved.page.title}
        parentId={resolved.page.parentId}
        parentCandidates={parentCandidates}
        canReparent={canReparent}
        isStartPage={(wiki?.startPage ?? DEFAULT_WIKI_START_PAGE) === resolved.page.title}
        canSetStartPage={canSetStartPage}
      />
    </main>
  );
}
