import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { IssueRepository } from "@/domain/issue/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import { archiveBlockingVersionIds, planArchive, planClose, planReopen, planUnarchive } from "@/domain/project/status-change";
import type { VersionRepository } from "@/domain/version/repository";

export class ProjectStatusChangeNotPermittedError extends Error {
  constructor() {
    super("The acting user may not change this project's status.");
    this.name = "ProjectStatusChangeNotPermittedError";
  }
}

/** Redmine's `error_can_not_archive_project` — Project#archive returned false. */
export class ProjectArchiveBlockedError extends Error {
  constructor(public readonly blockingVersionIds: string[]) {
    super("An issue outside this project's subtree is assigned to one of its versions.");
    this.name = "ProjectArchiveBlockedError";
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} not found`);
    this.name = "ProjectNotFoundError";
  }
}

export interface ArchiveProjectRepositories {
  projectRepository: ProjectRepository;
  versionRepository: VersionRepository;
  issueRepository: IssueRepository;
}

async function loadProject(projectRepository: ProjectRepository, projectId: string): Promise<Project> {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  return project;
}

/**
 * Redmine gates archive/unarchive on `require_admin` in ProjectsController, not on a project
 * permission — so these two take a plain admin flag rather than an AuthorizationActor. They
 * could not use `can` even if a permission existed: it denies *everyone* on an archived
 * project, including admins, which would make unarchiving impossible.
 */
export async function archiveProject(
  repositories: ArchiveProjectRepositories,
  input: { projectId: string; isAdmin: boolean },
): Promise<void> {
  if (!input.isAdmin) {
    throw new ProjectStatusChangeNotPermittedError();
  }

  const all = await repositories.projectRepository.listAll();
  const project = await loadProject(repositories.projectRepository, input.projectId);
  const plan = planArchive(project, all);

  const versions = await repositories.versionRepository.listByProjects(plan.projectIds);
  const issues = await repositories.issueRepository.listByFixedVersionIds(versions.map((version) => version.id));
  const blocking = archiveBlockingVersionIds(project, all, versions, issues);
  if (blocking.length > 0) {
    throw new ProjectArchiveBlockedError(blocking);
  }

  await repositories.projectRepository.updateStatus(plan.projectIds, plan.status);
}

export async function unarchiveProject(
  repositories: { projectRepository: ProjectRepository },
  input: { projectId: string; isAdmin: boolean },
): Promise<void> {
  if (!input.isAdmin) {
    throw new ProjectStatusChangeNotPermittedError();
  }

  const all = await repositories.projectRepository.listAll();
  const project = await loadProject(repositories.projectRepository, input.projectId);
  const plan = planUnarchive(project, all);
  await repositories.projectRepository.updateStatus(plan.projectIds, plan.status);
}

/**
 * Redmine's ProjectsController#close / #reopen, gated by `authorize` on `close_project`.
 * The permission is `:read => true` there, which is what lets a *closed* project be
 * reopened at all — a non-read permission is denied on an inactive project.
 */
export async function closeProject(
  repositories: { projectRepository: ProjectRepository },
  input: { projectId: string; actor: AuthorizationActor },
): Promise<void> {
  const all = await repositories.projectRepository.listAll();
  const project = await loadProject(repositories.projectRepository, input.projectId);
  if (!can({ permission: "close_project", project: projectAuthorizationContext(project), actor: input.actor })) {
    throw new ProjectStatusChangeNotPermittedError();
  }

  const plan = planClose(project, all);
  await repositories.projectRepository.updateStatus(plan.projectIds, plan.status);
}

export async function reopenProject(
  repositories: { projectRepository: ProjectRepository },
  input: { projectId: string; actor: AuthorizationActor },
): Promise<void> {
  const all = await repositories.projectRepository.listAll();
  const project = await loadProject(repositories.projectRepository, input.projectId);
  if (!can({ permission: "close_project", project: projectAuthorizationContext(project), actor: input.actor })) {
    throw new ProjectStatusChangeNotPermittedError();
  }

  const plan = planReopen(project, all);
  await repositories.projectRepository.updateStatus(plan.projectIds, plan.status);
}
