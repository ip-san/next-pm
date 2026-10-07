import { notFound, redirect } from "next/navigation";
import { DEFAULT_WIKI_START_PAGE } from "@/domain/wiki/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiRepository } from "@/infrastructure/db/repositories/wiki-repository";

/** Mirrors Redmine's `match 'wiki'` route: the project's wiki opens on its configured start page. */
export default async function WikiIndexPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const wiki = await new DrizzleWikiRepository().findByProject(project.id);
  redirect(`/projects/${identifier}/wiki/${encodeURIComponent(wiki?.startPage ?? DEFAULT_WIKI_START_PAGE)}`);
}
