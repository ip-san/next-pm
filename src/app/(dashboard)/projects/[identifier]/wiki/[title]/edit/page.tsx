import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { selfAndDescendantIds } from "@/domain/wiki/hierarchy";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { WikiEditForm } from "./wiki-edit-form";

export default async function WikiEditPage({
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
  if (!can({ permission: "edit_wiki_pages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const wikiPage = await new DrizzleWikiPageRepository().findByTitle(project.id, title);
  // WikiController#edit returns 403 on a protected page unless the actor can unprotect it.
  if (wikiPage && !isWikiPageEditable(wikiPage, can({ permission: "protect_wiki_pages", project: toAuthorizationProject(project), actor }))) {
    notFound();
  }
  const current = wikiPage ? await new DrizzleWikiContentRepository().findCurrent(wikiPage.id) : null;

  // Redmine renders the parent select whenever parent_id is a safe attribute: always for a
  // new page, and afterwards only with rename_wiki_pages.
  const canSetParent = wikiPage === null || can({ permission: "rename_wiki_pages", project: toAuthorizationProject(project), actor });
  const pages = canSetParent ? await new DrizzleWikiPageRepository().listForProject(project.id) : [];
  const excluded = wikiPage ? selfAndDescendantIds(pages, wikiPage.id) : new Set<string>();
  const parentCandidates = pages
    .filter((candidate) => !excluded.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, title: candidate.title }));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{title} を編集</h1>
      <WikiEditForm
        projectId={project.id}
        projectIdentifier={identifier}
        title={title}
        initialText={current?.text ?? ""}
        parentId={wikiPage?.parentId ?? null}
        parentCandidates={parentCandidates}
        canSetParent={canSetParent}
      />
    </main>
  );
}
