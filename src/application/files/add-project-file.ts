import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { VersionRepository } from "@/domain/version/repository";
import { uploadAttachment } from "@/application/attachments/upload-attachment";

export class InvalidProjectFileError extends Error {}

export interface AddProjectFileInput {
  projectId: string;
  /** Null attaches the file to the project itself — FilesController#create's blank version_id. */
  versionId: string | null;
  authorId: string;
  filename: string;
  contentType: string;
  description: string;
  data: Buffer;
}

export interface AddProjectFileRepositories {
  attachmentRepository: AttachmentRepository;
  attachmentStorage: AttachmentStorage;
  settingsRepository: SettingsRepository;
  versionRepository: VersionRepository;
}

/**
 * Mirrors FilesController#create: the container is the project, or one of the project's *own*
 * versions (`@project.versions.find_by_id`) — a version merely shared into the project from
 * elsewhere is not a valid target, because its files belong on its owning project's page.
 */
export async function addProjectFile(repositories: AddProjectFileRepositories, input: AddProjectFileInput): Promise<Attachment> {
  if (input.versionId) {
    const version = await repositories.versionRepository.findById(input.versionId);
    if (!version || version.projectId !== input.projectId) {
      throw new InvalidProjectFileError("バージョンが見つかりません。");
    }
  }

  return uploadAttachment(repositories, {
    containerType: input.versionId ? "Version" : "Project",
    containerId: input.versionId ?? input.projectId,
    authorId: input.authorId,
    filename: input.filename,
    contentType: input.contentType,
    description: input.description,
    data: input.data,
  });
}
