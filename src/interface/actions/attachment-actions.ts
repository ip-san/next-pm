"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { uploadAttachment } from "@/application/attachments/upload-attachment";
import { journalizeAttachment } from "@/application/issues/journalize-attachment";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { localizeError } from "@/interface/http/localize-error";

export type UploadAttachmentActionState = {
  error: string | null;
};

const uploadAttachmentSchema = z.object({
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  description: z.string().default(""),
  file: z.instanceof(File),
});

export async function uploadIssueAttachmentAction(
  _prevState: UploadAttachmentActionState,
  formData: FormData,
): Promise<UploadAttachmentActionState> {
  const parsed = uploadAttachmentSchema.safeParse({
    issueId: formData.get("issueId"),
    projectIdentifier: formData.get("projectIdentifier"),
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

  const issue = await new DrizzleIssueRepository().findById(parsed.data.issueId);
  if (!issue) {
    return { error: await localizeError("チケットが見つかりません。") };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: await localizeError("プロジェクトが見つかりません。") };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  // Mirrors Issue#attachments_addable? — `attributes_editable? || notes_addable?`, so
  // someone who may only comment can attach a file to that comment.
  const hasEditIssues = can({ permission: "edit_issues", project: projectContext, actor });
  const hasEditOwnIssues = can({ permission: "edit_own_issues", project: projectContext, actor });
  const hasAddNotes = can({ permission: "add_issue_notes", project: projectContext, actor });
  if (!hasEditIssues && !(hasEditOwnIssues && issue.authorId === user.id) && !hasAddNotes) {
    return { error: await localizeError("この操作を行う権限がありません。") };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: await localizeError("チケットが見つかりません。") };
  }

  const buffer = Buffer.from(await parsed.data.file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await uploadAttachment(
      {
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        containerType: "Issue",
        containerId: issue.id,
        authorId: user.id,
        filename: parsed.data.file.name,
        contentType: parsed.data.file.type,
        description: parsed.data.description,
        data: buffer,
      },
    );
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  // Issue#attachment_added — the add shows up in the issue's history, like any other change.
  await journalizeAttachment(
    { journalRepository: new DrizzleJournalRepository() },
    { issueId: issue.id, userId: user.id, attachment: uploaded, change: "added" },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}

export type DeleteAttachmentActionState = {
  error: string | null;
};

const deleteAttachmentSchema = z.object({
  attachmentId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

export async function deleteIssueAttachmentAction(
  _prevState: DeleteAttachmentActionState,
  formData: FormData,
): Promise<DeleteAttachmentActionState> {
  const parsed = deleteAttachmentSchema.safeParse({
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
  if (!attachment || attachment.containerType !== "Issue" || !attachment.containerId) {
    return { error: await localizeError("添付ファイルが見つかりません。") };
  }

  const issue = await new DrizzleIssueRepository().findById(attachment.containerId);
  if (!issue) {
    return { error: await localizeError("チケットが見つかりません。") };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: await localizeError("プロジェクトが見つかりません。") };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: await localizeError("チケットが見つかりません。") };
  }
  // Deletion stays edit-only: Issue#attachments_editable? is `visible? && attributes_editable?`,
  // with no notes_addable? branch — add_issue_notes lets you attach, not detach.
  const projectContext = toAuthorizationProject(project);
  const hasEditIssues = can({ permission: "edit_issues", project: projectContext, actor });
  const hasEditOwnIssues = can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!hasEditIssues && !(hasEditOwnIssues && issue.authorId === user.id)) {
    return { error: await localizeError("この操作を行う権限がありません。") };
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  // Issue#attachment_removed — AttachmentsController#destroy init_journal's the container.
  await journalizeAttachment(
    { journalRepository: new DrizzleJournalRepository() },
    { issueId: issue.id, userId: user.id, attachment, change: "removed" },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}
