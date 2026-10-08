import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { descendantIds, selfAndDescendantIds } from "@/domain/wiki/hierarchy";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiPageRepository, DrizzleWikiRedirectRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { WikiDestroyForm } from "./wiki-destroy-form";

/**
 * Mirrors WikiController#destroy's confirmation step (wiki/destroy.html.erb): a page with
 * children cannot be deleted until the user says what happens to them.
 */
export default async function WikiDestroyPage({
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
  if (!can({ permission: "delete_wiki_pages", project: projectContext, actor })) {
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
  const page = resolved.page;
  if (!isWikiPageEditable(page, can({ permission: "protect_wiki_pages", project: projectContext, actor }))) {
    notFound();
  }

  const pages = await wikiPageRepository.listForProject(project.id);
  // Redmine's @reassignable_to: every page except the one being deleted and its own subtree.
  const excluded = selfAndDescendantIds(pages, page.id);
  const reassignCandidates = pages.filter((candidate) => !excluded.has(candidate.id)).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
  }));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{page.title} を削除</h1>
      <WikiDestroyForm
        pageId={page.id}
        projectIdentifier={identifier}
        title={page.title}
        descendantCount={descendantIds(pages, page.id).size}
        reassignCandidates={reassignCandidates}
      />
    </main>
  );
}
