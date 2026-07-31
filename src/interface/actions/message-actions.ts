"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { canDeleteMessage, canEditMessage } from "@/domain/message/authorization";
import { InvalidMessageError, LockedTopicError, postMessage } from "@/application/messages/post-message";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
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
});

export async function editMessageAction(_prevState: MessageMutationActionState, formData: FormData): Promise<MessageMutationActionState> {
  const parsed = editMessageSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    messageId: formData.get("messageId"),
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
  const hasEditMessages = can({ permission: "edit_messages", project: projectContext, actor });
  const hasEditOwnMessages = can({ permission: "edit_own_messages", project: projectContext, actor });
  if (!canEditMessage(message, user.id, hasEditMessages, hasEditOwnMessages)) {
    return { error: "この操作を行う権限がありません。" };
  }

  if (parsed.data.subject.length > 255) {
    return { error: "件名は255文字以内で入力してください。" };
  }

  await messageRepository.update(message.id, { subject: parsed.data.subject, content: parsed.data.content });

  const topicId = message.parentId ?? message.id;
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}/messages/${topicId}`);
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

  await messageRepository.delete(message.id);

  const topicId = message.parentId ?? message.id;
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}`);
  if (message.parentId) {
    redirect(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}/messages/${topicId}`);
  }
  redirect(`/projects/${parsed.data.projectIdentifier}/boards/${parsed.data.boardId}`);
}
