import { can } from "@/domain/authorization/authorization-service";
import type { LinkTarget } from "@/domain/formatting/repository-references";
import type { User } from "@/domain/user/entity";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/** The project a piece of text belongs to: its links to wiki pages and revisions are judged against it. */
export interface TextProject {
  id: string;
  identifier: string;
}

/**
 * The `[[Page]]` links for a text in a project: a page the viewer may read (view_wiki_pages) and that exists. Any
 * other title gets no link.
 */
export async function resolveWikiLinks(user: User | null, project: TextProject, titles: string[]): Promise<Map<string, LinkTarget>> {
  const links = new Map<string, LinkTarget>();
  if (titles.length === 0) return links;
  const { actor } = await resolveActor(user, project.id);
  const projectRecord = await loadProject(project.id);
  if (!projectRecord || !can({ permission: "view_wiki_pages", project: toAuthorizationProject(projectRecord), actor })) return links;
  const pages = new DrizzleWikiPageRepository();
  for (const title of titles) {
    const page = await pages.findByTitle(project.id, title);
    if (page) links.set(title, { href: `/projects/${project.identifier}/wiki/${encodeURIComponent(page.title)}` });
  }
  return links;
}

/**
 * The `r<id>` links for a text in a project: a changeset with that exact revision in one of the project's
 * repositories, when the viewer may see changesets there (view_changesets).
 */
export async function resolveRevisionLinks(user: User | null, project: TextProject, ids: string[]): Promise<Map<string, LinkTarget>> {
  const links = new Map<string, LinkTarget>();
  if (ids.length === 0) return links;
  const { actor } = await resolveActor(user, project.id);
  const projectRecord = await loadProject(project.id);
  if (!projectRecord || !can({ permission: "view_changesets", project: toAuthorizationProject(projectRecord), actor })) return links;
  const repositories = await new DrizzleScmRepositoryRepository().listByProject(project.id);
  const changesets = new DrizzleChangesetRepository();
  for (const id of ids) {
    for (const repository of repositories) {
      const changeset = await changesets.findByRevision(repository.id, id);
      if (changeset) {
        links.set(id, { href: `/projects/${project.identifier}/repository/${repository.id}/revisions/${changeset.revision}` });
        break;
      }
    }
  }
  return links;
}

function loadProject(projectId: string) {
  return new DrizzleProjectRepository().findById(projectId);
}
