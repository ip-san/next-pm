"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import { InvalidBoardError } from "@/domain/board/validate";
import { createBoard } from "@/application/boards/create-board";
import { deleteBoard } from "@/application/boards/delete-board";
import { reorderBoard } from "@/application/boards/reorder-board";
import { updateBoard } from "@/application/boards/update-board";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { localizeError } from "@/interface/http/localize-error";

export type BoardActionState = {
  error: string | null;
};

/** Every board mutation sits behind `manage_boards`, exactly as BoardsController's `:authorize` does. */
async function authorizeManageBoards(
  projectIdentifier: string,
): Promise<{ error: string; project: null } | { error: null; project: Project }> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。"), project: null };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    return { error: await localizeError("プロジェクトが見つかりません。"), project: null };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_boards", project: toAuthorizationProject(project), actor })) {
    return { error: await localizeError("この操作を行う権限がありません。"), project: null };
  }

  return { error: null, project };
}

export type CreateBoardActionState = BoardActionState;

const createBoardSchema = z.object({
  projectIdentifier: z.string().min(1),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1),
  description: z.string().min(1),
});

export async function createBoardAction(_prevState: CreateBoardActionState, formData: FormData): Promise<CreateBoardActionState> {
  const parsed = createBoardSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    parentId: formData.get("parentId") || null,
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const authorized = await authorizeManageBoards(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: await localizeError(authorized.error) };
  }

  try {
    await createBoard(
      { boardRepository: new DrizzleBoardRepository() },
      {
        projectId: authorized.project.id,
        parentId: parsed.data.parentId,
        name: parsed.data.name,
        description: parsed.data.description,
      },
    );
  } catch (error) {
    if (error instanceof InvalidBoardError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards`);
  return { error: null };
}

const updateBoardSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1),
  description: z.string().min(1),
});

export async function updateBoardAction(_prevState: BoardActionState, formData: FormData): Promise<BoardActionState> {
  const parsed = updateBoardSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    parentId: formData.get("parentId") || null,
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const authorized = await authorizeManageBoards(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: await localizeError(authorized.error) };
  }

  try {
    await updateBoard(
      { boardRepository: new DrizzleBoardRepository() },
      {
        boardId: parsed.data.boardId,
        projectId: authorized.project.id,
        parentId: parsed.data.parentId,
        name: parsed.data.name,
        description: parsed.data.description,
      },
    );
  } catch (error) {
    if (error instanceof InvalidBoardError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards`);
  return { error: null };
}

const reorderBoardSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
  position: z.coerce.number().int().min(1),
});

export async function reorderBoardAction(_prevState: BoardActionState, formData: FormData): Promise<BoardActionState> {
  const parsed = reorderBoardSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
    position: formData.get("position"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const authorized = await authorizeManageBoards(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: await localizeError(authorized.error) };
  }

  try {
    await reorderBoard(
      { boardRepository: new DrizzleBoardRepository() },
      { boardId: parsed.data.boardId, projectId: authorized.project.id, position: parsed.data.position },
    );
  } catch (error) {
    if (error instanceof InvalidBoardError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards`);
  return { error: null };
}

const deleteBoardSchema = z.object({
  projectIdentifier: z.string().min(1),
  boardId: z.string().uuid(),
});

export async function deleteBoardAction(_prevState: BoardActionState, formData: FormData): Promise<BoardActionState> {
  const parsed = deleteBoardSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    boardId: formData.get("boardId"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const authorized = await authorizeManageBoards(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: await localizeError(authorized.error) };
  }

  await deleteBoard(
    {
      boardRepository: new DrizzleBoardRepository(),
      messageRepository: new DrizzleMessageRepository(),
      attachmentRepository: new DrizzleAttachmentRepository(),
      attachmentStorage: new FsAttachmentStore(),
    },
    { boardId: parsed.data.boardId, projectId: authorized.project.id },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards`);
  redirect(`/projects/${parsed.data.projectIdentifier}/boards`);
}
