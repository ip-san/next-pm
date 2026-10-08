import { isActiveProject, type Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { ScmRepository, ScmVendor } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";
import { connectRepository } from "./connect-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SysApiRepositories {
  projectRepository: ProjectRepository;
  scmRepositoryRepository: ScmRepositoryRepository;
}

/** What Redmine's SysController#projects renders for each active project with the repository module. */
export interface SysProjectView {
  id: string;
  identifier: string;
  name: string;
  is_public: boolean;
  /** Redmine's Project::STATUS_ACTIVE; only active projects are listed. */
  status: 1;
  /** The project's default repository, which is what Redmine's `has_one :repository` returns. */
  repository: { id: string; url: string } | null;
}

/** Projects the repository web service may see: active, with the repository module enabled. */
function repositoryProjects(projects: Project[]): Project[] {
  return projects
    .filter((project) => isActiveProject(project) && project.enabledModules.includes("repository"))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
}

export async function listSysProjects(repositories: SysApiRepositories): Promise<SysProjectView[]> {
  const projects = repositoryProjects(await repositories.projectRepository.listAll());
  return Promise.all(
    projects.map(async (project) => {
      const defaultRepository = (await repositories.scmRepositoryRepository.listByProject(project.id)).find(
        (repository) => repository.isDefault,
      );
      return {
        id: project.id,
        identifier: project.identifier,
        name: project.name,
        is_public: project.isPublic,
        status: 1,
        repository: defaultRepository ? { id: defaultRepository.id, url: defaultRepository.rootPath } : null,
      };
    }),
  );
}

export interface CreateSysRepositoryInput {
  projectId: string;
  vendor: ScmVendor;
  /** Redmine's `repository[identifier]`; blank for the project's unnamed default repository. */
  identifier: string;
  /** Redmine's `repository[url]`: an absolute path, or a URL for Subversion. */
  url: string;
}

/**
 * Mirrors SysController#create_project_repository: a project that already has a default
 * repository gets a conflict, otherwise the new repository is registered as the default.
 */
export async function createSysProjectRepository(
  repositories: SysApiRepositories & { scmRepositoryRepository: ScmRepositoryRepository },
  input: CreateSysRepositoryInput,
): Promise<{ status: "created"; repository: ScmRepository } | { status: "conflict" }> {
  const existing = await repositories.scmRepositoryRepository.listByProject(input.projectId);
  if (existing.some((repository) => repository.isDefault)) {
    return { status: "conflict" };
  }
  const repository = await connectRepository(repositories, {
    projectId: input.projectId,
    identifier: input.identifier,
    vendor: input.vendor,
    rootPath: input.url,
    isDefault: true,
  });
  return { status: "created", repository };
}

/**
 * Mirrors SysController#fetch_changesets. `id` is a project id or identifier, or null for every
 * repository-enabled project. `fetch` runs the caller's changeset sync for one repository, so
 * the route supplies the same dependencies the repository screen's sync action uses.
 */
export async function fetchSysChangesets(
  repositories: SysApiRepositories,
  id: string | null,
  fetch: (repository: ScmRepository) => Promise<unknown>,
): Promise<"ok" | "not_found"> {
  let projects: Project[];
  if (id === null) {
    projects = repositoryProjects(await repositories.projectRepository.listAll());
  } else {
    // Redmine takes a numeric id or an identifier; here an id is a UUID, so anything else is looked up by identifier.
    const found = UUID.test(id) ? await repositories.projectRepository.findById(id) : await repositories.projectRepository.findByIdentifier(id);
    if (!found || !repositoryProjects([found]).length) {
      return "not_found";
    }
    projects = [found];
  }
  for (const project of projects) {
    for (const repository of await repositories.scmRepositoryRepository.listByProject(project.id)) {
      await fetch(repository);
    }
  }
  return "ok";
}
