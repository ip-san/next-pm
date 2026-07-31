import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
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
  const current = wikiPage ? await new DrizzleWikiContentRepository().findCurrent(wikiPage.id) : null;

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{title} を編集</h1>
      <WikiEditForm projectId={project.id} projectIdentifier={identifier} title={title} initialText={current?.text ?? ""} />
    </main>
  );
}
