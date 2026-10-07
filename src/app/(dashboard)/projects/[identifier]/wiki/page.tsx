import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DEFAULT_WIKI_START_PAGE } from "@/domain/wiki/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/**
 * Mirrors Redmine's `match 'wiki'` route: the project's wiki opens on its configured start
 * page. WikiController gates every action including `show` behind view_wiki_pages, and the
 * gate belongs here rather than only on the page this redirects to — the redirect target is
 * the configured start page title, which is itself wiki content.
 */
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

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const wiki = await new DrizzleWikiRepository().findByProject(project.id);
  redirect(`/projects/${identifier}/wiki/${encodeURIComponent(wiki?.startPage ?? DEFAULT_WIKI_START_PAGE)}`);
}
