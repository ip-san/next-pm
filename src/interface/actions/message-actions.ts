"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { can } from "@/domain/authorization/authorization-service";
import { canDeleteMessage, canEditMessage } from "@/domain/message/authorization";
import { memberUserIds } from "@/domain/member/entity";
import { uploadAttachment } from "@/application/attachments/upload-attachment";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { messageMailSubject } from "@/domain/mail/subject";
import { deleteMessage } from "@/application/messages/delete-message";
import { editMessage } from "@/application/messages/edit-message";
import { InvalidMessageError, LockedTopicError, postMessage } from "@/application/messages/post-message";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type PostMessageActionState = {
  error: string | null;
};

const postMessageSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  subject: z.string().min(1),
  content: z.string().min(1),
});

export async function postMessageAction(_prevState: PostMessageActionState, formData: FormData): Promise<PostMessageActionState> {
  const parsed = postMessageSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    parentId: formData.get("parentId") || undefined,
    subject: formData.get("subject"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const board = await new DrizzleBoardRepository().findById(parsed.data.boardId);
  if (!board || board.projectId !== project.id) {
    return { error: "フォーラムが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_messages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  let message;
  try {
    message = await postMessage({ messageRepository: new DrizzleMessageRepository() }, {
      boardId: board.id,
      parentId: parsed.data.parentId ?? null,
      authorId: user.id,
      subject: parsed.data.subject,
      content: parsed.data.content,
    });
  } catch (error) {
    if (error instanceof InvalidMessageError || error instanceof LockedTopicError) {
      return { error: error.message };
    }
    throw error;
  }

  const topicId = parsed.data.parentId ?? message.id;
  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("Message", topicId);
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [memberUserIds(members), watcherUserIds],
      excludeUserId: user.id,
      subject: messageMailSubject(project.name, topicId, message.subject),
      body: message.content,
    },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${board.id}`);
  redirect(`/projects/${parsed.data.projectIdentifier}/boards/${board.id}/messages/${topicId}`);
}

export type MessageMutationActionState = {
  error: string | null;
};

const editMessageSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  messageId: z.string().uuid(),
  subject: z.string().min(1),
  content: z.string().min(1),
  locked: z.boolean(),
  sticky: z.boolean(),
  targetBoardId: z.string().uuid().nullable(),
});

export async function editMessageAction(_prevState: MessageMutationActionState, formData: FormData): Promise<MessageMutationActionState> {
  const parsed = editMessageSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    messageId: formData.get("messageId"),
    subject: formData.get("subject"),
    content: formData.get("content"),
    locked: formData.get("locked") !== null,
    sticky: formData.get("sticky") !== null,
    targetBoardId: formData.get("targetBoardId") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const messageRepository = new DrizzleMessageRepository();
  const message = await messageRepository.findById(parsed.data.messageId);
  if (!message || message.boardId !== parsed.data.boardId) {
    return { error: "投稿が見つかりません。" };
  }

  const boardRepository = new DrizzleBoardRepository();
  const board = await boardRepository.findById(message.boardId);
  if (!board || board.projectId !== project.id) {
    return { error: "投稿が見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const hasEditMessages = can({ permission: "edit_messages", project: projectContext, actor });
  const hasEditOwnMessages = can({ permission: "edit_own_messages", project: projectContext, actor });
  if (!canEditMessage(message, user.id, hasEditMessages, hasEditOwnMessages)) {
    return { error: "この操作を行う権限がありません。" };
  }

  let updated;
  try {
    updated = await editMessage(
      { messageRepository, boardRepository },
      {
        message,
        subject: parsed.data.subject,
        content: parsed.data.content,
        canEditAllMessages: hasEditMessages,
        locked: parsed.data.locked,
        sticky: parsed.data.sticky,
        boardId: parsed.data.targetBoardId ?? message.boardId,
      },
    );
  } catch (error) {
    if (error instanceof InvalidMessageError) {
      return { error: error.message };
    }
    throw error;
  }

  const topicId = message.parentId ?? message.id;
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}/messages/${topicId}`);
  if (updated.boardId !== message.boardId) {
    // The thread lives under a new board, so its canonical URL changed with it.
    redirect(`/projects/${parsed.data.projectIdentifier}/boards/${updated.boardId}/messages/${topicId}`);
  }
  return { error: null };
}

const deleteMessageSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export async function deleteMessageAction(_prevState: MessageMutationActionState, formData: FormData): Promise<MessageMutationActionState> {
  const parsed = deleteMessageSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    messageId: formData.get("messageId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const messageRepository = new DrizzleMessageRepository();
  const message = await messageRepository.findById(parsed.data.messageId);
  if (!message || message.boardId !== parsed.data.boardId) {
    return { error: "投稿が見つかりません。" };
  }

  const board = await new DrizzleBoardRepository().findById(message.boardId);
  if (!board || board.projectId !== project.id) {
    return { error: "投稿が見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const hasDeleteMessages = can({ permission: "delete_messages", project: projectContext, actor });
  const hasDeleteOwnMessages = can({ permission: "delete_own_messages", project: projectContext, actor });
  if (!canDeleteMessage(message, user.id, hasDeleteMessages, hasDeleteOwnMessages)) {
    return { error: "この操作を行う権限がありません。" };
  }

  await deleteMessage(
    {
      messageRepository,
      attachmentRepository: new DrizzleAttachmentRepository(),
      attachmentStorage: new FsAttachmentStore(),
    },
    message,
  );

  const topicId = message.parentId ?? message.id;
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}`);
  if (message.parentId) {
    redirect(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}/messages/${topicId}`);
  }
  redirect(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}`);
}

export type MessageAttachmentActionState = {
  error: string | null;
};

const uploadMessageAttachmentSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  messageId: z.string().uuid(),
  description: z.string().default(""),
  file: z.instanceof(File),
});

/**
 * Redmine has no standalone "attach to message" endpoint: attachments ride along with
 * MessagesController#edit (`@message.save_attachments`), so the gate is `Message#editable_by?`
 * — edit_messages, or edit_own_messages on one's own post. Removing an attachment is stricter
 * (`acts_as_attachable` leaves Message's delete permission at the default edit_messages).
 */
export async function uploadMessageAttachmentAction(
  _prevState: MessageAttachmentActionState,
  formData: FormData,
): Promise<MessageAttachmentActionState> {
  const parsed = uploadMessageAttachmentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    messageId: formData.get("messageId"),
    description: formData.get("description") ?? "",
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  if (parsed.data.file.size === 0) {
    return { error: "ファイルを選択してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const message = await new DrizzleMessageRepository().findById(parsed.data.messageId);
  if (!message || message.boardId !== parsed.data.boardId) {
    return { error: "投稿が見つかりません。" };
  }

  const board = await new DrizzleBoardRepository().findById(message.boardId);
  if (!board) {
    return { error: "フォーラムが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(board.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const editable = canEditMessage(
    message,
    user.id,
    can({ permission: "edit_messages", project: projectContext, actor }),
    can({ permission: "edit_own_messages", project: projectContext, actor }),
  );
  if (!editable) {
    return { error: "この操作を行う権限がありません。" };
  }

  const buffer = Buffer.from(await parsed.data.file.arrayBuffer());
  try {
    await uploadAttachment(
      {
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        containerType: "Message",
        containerId: message.id,
        authorId: user.id,
        filename: parsed.data.file.name,
        contentType: parsed.data.file.type,
        description: parsed.data.description,
        data: buffer,
      },
    );
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}/messages/${message.parentId ?? message.id}`);
  return { error: null };
}

const deleteMessageAttachmentSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export async function deleteMessageAttachmentAction(
  _prevState: MessageAttachmentActionState,
  formData: FormData,
): Promise<MessageAttachmentActionState> {
  const parsed = deleteMessageAttachmentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    attachmentId: formData.get("attachmentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(parsed.data.attachmentId);
  if (!attachment || attachment.containerType !== "Message" || !attachment.containerId) {
    return { error: "添付ファイルが見つかりません。" };
  }

  const message = await new DrizzleMessageRepository().findById(attachment.containerId);
  if (!message || message.boardId !== parsed.data.boardId) {
    return { error: "投稿が見つかりません。" };
  }

  const board = await new DrizzleBoardRepository().findById(message.boardId);
  if (!board) {
    return { error: "フォーラムが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(board.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_messages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}/messages/${message.parentId ?? message.id}`);
  return { error: null };
}
