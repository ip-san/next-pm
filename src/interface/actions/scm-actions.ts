"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { connectRepository, InvalidRepositoryError } from "@/application/scm/connect-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ConnectRepositoryActionState = {
  error: string | null;
};

const connectRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
  rootPath: z.string().min(1),
});

export async function connectRepositoryAction(
  _prevState: ConnectRepositoryActionState,
  formData: FormData,
): Promise<ConnectRepositoryActionState> {
  const parsed = connectRepositorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    rootPath: formData.get("rootPath"),
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
  if (!can({ permission: "manage_repository", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await connectRepository(
      { scmRepositoryRepository: new DrizzleScmRepositoryRepository() },
      { projectId: project.id, rootPath: parsed.data.rootPath },
    );
  } catch (error) {
    if (error instanceof InvalidRepositoryError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repository`);
  return { error: null };
}
