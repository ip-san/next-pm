import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { AttachmentStorage } from "@/domain/attachment/repository";
import { isProjectDeletable } from "@/domain/project/entity";
import { planDelete } from "@/domain/project/nested-set";
import type { ProjectRepository } from "@/domain/project/repository";

export class DeleteProjectNotPermittedError extends Error {
  constructor() {
    super("The acting user may not delete this project.");
    this.name = "DeleteProjectNotPermittedError";
  }
}

/** Redmine's ProjectsController#destroy requires `params[:confirm] == project.identifier`. */
export class ProjectDeleteConfirmationMismatchError extends Error {
  constructor() {
    super("The typed identifier does not match the project being deleted.");
    this.name = "ProjectDeleteConfirmationMismatchError";
  }
}

export interface DeleteProjectRepositories {
  projectRepository: ProjectRepository;
  attachmentStorage: AttachmentStorage;
}

export interface DeleteProjectInput {
  projectId: string;
  actor: AuthorizationActor;
  isAdmin: boolean;
  /**
   * The identifier the user typed, which must equal the project's. Redmine demands it for
   * the HTML path and skips it for API requests (`api_request? || params[:confirm] == ...`),
   * so a REST caller passes the project's own identifier.
   */
  confirmIdentifier: string;
}

/**
 * Redmine's ProjectsController#destroy. Deletion cascades through the whole subtree —
 * issues, versions, wiki, boards, news, documents, time entries, members, enumeration
 * overrides and every attachment, including the files on disk.
 *
 * Returns the number of attachment files removed, which is the only part of the cascade the
 * caller cannot see for itself afterwards.
 */
export async function deleteProject(repositories: DeleteProjectRepositories, input: DeleteProjectInput): Promise<number> {
  const { projectRepository } = repositories;
  const project = await projectRepository.findById(input.projectId);
  if (!project) {
    throw new Error(`Project ${input.projectId} not found`);
  }

  const all = await projectRepository.listNestedSetNodes();
  const plan = planDelete(all, project);
  const hasSubprojects = plan.removed.length > 1;

  const permitted = isProjectDeletable({
    isAdmin: input.isAdmin,
    hasDeletePermission: can({
      permission: "delete_project",
      project: projectAuthorizationContext(project),
      actor: input.actor,
    }),
    hasSubprojects,
  });
  if (!permitted) {
    throw new DeleteProjectNotPermittedError();
  }
  if (input.confirmIdentifier !== project.identifier) {
    throw new ProjectDeleteConfirmationMismatchError();
  }

  const removedIds = plan.removed.map((node) => node.id);
  // Read the storage keys before the rows go, and unlink the files only once the
  // transaction has committed: a rolled-back delete must not leave the attachments of a
  // project that still exists missing from disk.
  const attachments = await projectRepository.listAttachmentsInSubtree(removedIds);
  await projectRepository.deleteSubtree(removedIds, plan.shifted);
  for (const attachment of attachments) {
    await repositories.attachmentStorage.delete(attachment.storageKey);
  }

  return attachments.length;
}
