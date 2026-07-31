"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { createBoard, InvalidBoardError } from "@/application/boards/create-board";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type CreateBoardActionState = {
  error: string | null;
};

const createBoardSchema = z.object({
  projectIdentifier: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});

export async function createBoardAction(_prevState: CreateBoardActionState, formData: FormData): Promise<CreateBoardActionState> {
  const parsed = createBoardSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    name: formData.get("name"),
    description: formData.get("description"),
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

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_boards", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await createBoard({ boardRepository: new DrizzleBoardRepository() }, {
      projectId: project.id,
      name: parsed.data.name,
      description: parsed.data.description,
    });
  } catch (error) {
    if (error instanceof InvalidBoardError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards`);
  return { error: null };
}
