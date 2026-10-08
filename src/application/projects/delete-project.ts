import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { AttachmentStorage } from "@/domain/attachment/repository";
import { isProjectDeletable } from "@/domain/project/entity";
import { ProjectHasSubprojectsError, type ProjectRepository } from "@/domain/project/repository";

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

  // Redmine's Project#deletable?: an administrator may take a whole subtree, a permission
  // holder only a leaf. Whether the project *is* a leaf is deliberately not decided here —
  // it is a fact about the tree that can change between this check and the delete, so the
  // verdict handed down is "may this actor take non-leaf projects", and deleteSubtree
  // re-applies it against the tree it reads under lock.
  const hasDeletePermission = can({
    permission: "delete_project",
    project: projectAuthorizationContext(project),
    actor: input.actor,
  });
  if (!isProjectDeletable({ isAdmin: input.isAdmin, hasDeletePermission, hasSubprojects: false })) {
    throw new DeleteProjectNotPermittedError();
  }
  if (input.confirmIdentifier !== project.identifier) {
    throw new ProjectDeleteConfirmationMismatchError();
  }

  let attachmentStorageKeys: string[];
  try {
    ({ attachmentStorageKeys } = await projectRepository.deleteSubtree(project.id, { allowNonLeaf: input.isAdmin }));
  } catch (error) {
    if (error instanceof ProjectHasSubprojectsError) {
      throw new DeleteProjectNotPermittedError();
    }
    throw error;
  }

  // Only now that the transaction has committed: a rolled-back delete must not leave the
  // attachments of a project that still exists missing from disk.
  for (const storageKey of attachmentStorageKeys) {
    await repositories.attachmentStorage.delete(storageKey);
  }

  return attachmentStorageKeys.length;
}
