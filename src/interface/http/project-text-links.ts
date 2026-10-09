import { can } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import { anchorName } from "@/domain/formatting/anchors";
import { parseWikiTarget, type LinkTarget } from "@/domain/formatting/repository-references";
import { DEFAULT_WIKI_START_PAGE } from "@/domain/wiki/entity";
import type { User } from "@/domain/user/entity";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleWikiPageRepository, DrizzleWikiRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/** The project a piece of text belongs to: its links to wiki pages and revisions are judged against it. */
export interface TextProject {
  id: string;
  identifier: string;
}

/**
 * The wiki links for a text in a project: `[[Page]]` names a page of the text's project, and `[[project:Page]]` a page
 * of the project found by identifier, or else by name, as Redmine does. A target gets a link only when its project
 * exists, the viewer may view its wiki (view_wiki_pages), and the page exists. Any other target gets no link, so a
 * private project's existence is never revealed.
 */
export async function resolveWikiLinks(user: User | null, project: TextProject, targets: string[]): Promise<Map<string, LinkTarget>> {
  const links = new Map<string, LinkTarget>();
  if (targets.length === 0) return links;
  const pages = new DrizzleWikiPageRepository();
  const viewable = new Map<string, boolean>();
  for (const target of targets) {
    const { project: projectName, title, anchor } = parseWikiTarget(target);
    const fragment = anchor ? `#${anchorName(anchor)}` : "";
    // `[[#anchor]]`: a section of the page the text is on, which needs no lookup.
    if (projectName === null && title === "") {
      if (fragment !== "#") links.set(target, { href: fragment });
      continue;
    }
    const linkProject = projectName === null ? await loadProject(project.id) : await findProjectByIdentifierOrName(projectName);
    if (!linkProject) continue;
    if (!viewable.has(linkProject.id)) viewable.set(linkProject.id, await canViewWiki(user, linkProject));
    if (!viewable.get(linkProject.id)) continue;
    // `[[project:]]` names the project's start page (Redmine's Wiki#find_page with a blank title).
    const pageTitle = title !== "" ? title : ((await new DrizzleWikiRepository().findByProject(linkProject.id))?.startPage ?? DEFAULT_WIKI_START_PAGE);
    const page = await pages.findByTitle(linkProject.id, pageTitle);
    if (page) links.set(target, { href: `/projects/${linkProject.identifier}/wiki/${encodeURIComponent(page.title)}${fragment}` });
  }
  return links;
}

async function canViewWiki(user: User | null, projectRecord: Project): Promise<boolean> {
  const { actor } = await resolveActor(user, projectRecord.id);
  return can({ permission: "view_wiki_pages", project: toAuthorizationProject(projectRecord), actor });
}

async function findProjectByIdentifierOrName(identifierOrName: string): Promise<Project | null> {
  const repository = new DrizzleProjectRepository();
  return (await repository.findByIdentifier(identifierOrName)) ?? (await repository.findByName(identifierOrName));
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
      const changeset = await changesets.findByRevisionOrPrefix(repository.id, id);
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
