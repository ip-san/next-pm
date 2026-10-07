import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { PermissionKey } from "@/domain/authorization/permission-registry";
import type { Project } from "@/domain/project/entity";
import type { ScmRepository } from "@/domain/scm/entity";
import { resolveScmRepositoryByParam, scmRepositoryIdentifierParam } from "@/domain/scm/identifier";
import type { User } from "@/domain/user/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export interface RepositoryContext {
  project: Project;
  user: User | null;
  actor: AuthorizationActor;
  userGroupIds: string[];
  projectContext: ProjectAuthorizationContext;
  /** Every repository of the project, default first — for the repository switcher. */
  repositories: ScmRepository[];
  scmRepository: ScmRepository;
  /** URL prefix the page's own links hang off: the bare path for the default repository, `.../repository/<param>` otherwise. */
  basePath: string;
}

/**
 * The URL a repository is canonically reached at. Mirrors Redmine, which routes the project's
 * default repository at the bare `projects/:id/repository` and every other one at
 * `projects/:id/repository/:repository_id` keyed by `identifier_param`.
 */
export function repositoryPath(projectIdentifier: string, repository: ScmRepository): string {
  return repository.isDefault
    ? `/projects/${projectIdentifier}/repository`
    : `/projects/${projectIdentifier}/repository/${encodeURIComponent(scmRepositoryIdentifierParam(repository))}`;
}

/**
 * Shared preamble for every repository page: project, actor, permission and which of the
 * project's repositories the URL addresses.
 *
 * Repository resolution follows Redmine's `find_project_repository`: an absent `repositoryParam`
 * means the default repository (falling back to the project's first when a deleted default left
 * the project without one — Redmine never re-elects one), while a `repositoryParam` that matches
 * nothing in *this* project is a hard 404 rather than a silent fall back to the default.
 */
export async function loadRepositoryContext(
  projectIdentifier: string,
  repositoryParam: string | undefined,
  permission: Extract<PermissionKey, "browse_repository" | "view_changesets">,
): Promise<RepositoryContext> {
  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission, project: projectContext, actor })) {
    notFound();
  }

  const repositories = await new DrizzleScmRepositoryRepository().listByProject(project.id);
  const scmRepository =
    repositoryParam === undefined
      ? (repositories.find((repository) => repository.isDefault) ?? repositories[0] ?? null)
      : resolveScmRepositoryByParam(repositories, repositoryParam);
  if (!scmRepository) {
    notFound();
  }

  return {
    project,
    user,
    actor,
    userGroupIds,
    projectContext,
    repositories,
    scmRepository,
    basePath:
      repositoryParam === undefined
        ? `/projects/${projectIdentifier}/repository`
        : `/projects/${projectIdentifier}/repository/${encodeURIComponent(repositoryParam)}`,
  };
}
