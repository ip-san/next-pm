"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { addProjectFile, InvalidProjectFileError } from "@/application/files/add-project-file";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { updateAttachmentMetadata } from "@/application/attachments/update-attachment-metadata";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { resolveAttachmentAccess } from "@/interface/http/attachment-access";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { localizedMail } from "@/domain/i18n/mail-text";
import { interpolate, translate } from "@/domain/i18n/messages";
import { localizeError } from "@/interface/http/localize-error";

export type FileActionState = {
  error: string | null;
};

async function notifiableMemberIds(projectId: string) {
  const members = await new DrizzleMemberRepository().listByProject(projectId);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
  );
  return memberUserIds(filterMembersWithPermission(members, rolesById, "view_files"));
}

const addProjectFileSchema = z.object({
  projectIdentifier: z.string().min(1),
  versionId: z.union([z.string().uuid(), z.literal("")]).default(""),
  description: z.string().default(""),
  file: z.instanceof(File),
});

export async function addProjectFileAction(_prevState: FileActionState, formData: FormData): Promise<FileActionState> {
  const parsed = addProjectFileSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    versionId: formData.get("versionId") ?? "",
    description: formData.get("description") ?? "",
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }
  if (parsed.data.file.size === 0) {
    return { error: await localizeError("ファイルを選択してください。") };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: await localizeError("プロジェクトが見つかりません。") };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_files", project: toAuthorizationProject(project), actor })) {
    return { error: await localizeError("この操作を行う権限がありません。") };
  }

  let created;
  try {
    created = await addProjectFile(
      {
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        settingsRepository: new DrizzleSettingsRepository(),
        versionRepository: new DrizzleVersionRepository(),
      },
      {
        projectId: project.id,
        versionId: parsed.data.versionId || null,
        authorId: user.id,
        filename: parsed.data.file.name,
        contentType: parsed.data.file.type,
        description: parsed.data.description,
        data: Buffer.from(await parsed.data.file.arrayBuffer()),
      },
    );
  } catch (error) {
    if (error instanceof InvalidProjectFileError || error instanceof InvalidAttachmentError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  // Redmine's `file_added` notification (Mailer#attachments_added). It has no per-event
  // opt-in here — see the checklist's §15 note on notified_events being out of scope.
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [await notifiableMemberIds(project.id)],
      excludeUserId: user.id,
      ...localizedMail((locale) => ({
        subject: interpolate(translate(locale, "mail.fileAdded.subject"), { project: project.name, filename: created.filename }),
        body: `${interpolate(translate(locale, "mail.fileAdded.body"), { project: project.name, filename: created.filename })}\n/projects/${project.identifier}/files`,
      })),
    },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/files`);
  return { error: null };
}

const attachmentIdSchema = z.object({
  attachmentId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

export async function deleteProjectFileAction(_prevState: FileActionState, formData: FormData): Promise<FileActionState> {
  const parsed = attachmentIdSchema.safeParse({
    attachmentId: formData.get("attachmentId"),
    projectIdentifier: formData.get("projectIdentifier"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(parsed.data.attachmentId);
  if (!attachment || (attachment.containerType !== "Project" && attachment.containerType !== "Version")) {
    return { error: await localizeError("ファイルが見つかりません。") };
  }

  const access = await resolveAttachmentAccess(attachment, user);
  if (!access) {
    return { error: await localizeError("ファイルが見つかりません。") };
  }
  if (!access.allows("delete")) {
    return { error: await localizeError("この操作を行う権限がありません。") };
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/files`);
  return { error: null };
}

const updateDescriptionSchema = attachmentIdSchema.extend({
  description: z.string().default(""),
});

/** Redmine's AttachmentsController#update_all, narrowed to the one field the Files page shows. */
export async function updateAttachmentDescriptionAction(_prevState: FileActionState, formData: FormData): Promise<FileActionState> {
  const parsed = updateDescriptionSchema.safeParse({
    attachmentId: formData.get("attachmentId"),
    projectIdentifier: formData.get("projectIdentifier"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(parsed.data.attachmentId);
  if (!attachment) {
    return { error: await localizeError("ファイルが見つかりません。") };
  }

  const access = await resolveAttachmentAccess(attachment, user);
  if (!access) {
    return { error: await localizeError("ファイルが見つかりません。") };
  }
  if (!access.allows("edit")) {
    return { error: await localizeError("この操作を行う権限がありません。") };
  }

  try {
    await updateAttachmentMetadata({ attachmentRepository }, { attachmentId: attachment.id, description: parsed.data.description });
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/files`);
  return { error: null };
}
