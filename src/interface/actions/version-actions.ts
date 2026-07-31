"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { createVersion, InvalidVersionError } from "@/application/versions/create-version";
import { updateVersion } from "@/application/versions/update-version";
import { deleteVersion, VersionNotDeletableError } from "@/application/versions/delete-version";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type VersionActionState = {
  error: string | null;
};

const createVersionSchema = z.object({
  projectIdentifier: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  effectiveDate: z.string(),
});

export async function createVersionAction(_prevState: VersionActionState, formData: FormData): Promise<VersionActionState> {
  const parsed = createVersionSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    effectiveDate: formData.get("effectiveDate") ?? "",
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
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await createVersion(
      { versionRepository: new DrizzleVersionRepository() },
      {
        projectId: project.id,
        name: parsed.data.name,
        description: parsed.data.description,
        effectiveDate: parsed.data.effectiveDate.length > 0 ? parsed.data.effectiveDate : null,
        wikiPageTitle: null,
      },
    );
  } catch (error) {
    if (error instanceof InvalidVersionError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/versions`);
  return { error: null };
}

const updateVersionSchema = z.object({
  projectIdentifier: z.string().min(1),
  versionId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  effectiveDate: z.string(),
  status: z.enum(["open", "locked", "closed"]),
});

export async function updateVersionAction(_prevState: VersionActionState, formData: FormData): Promise<VersionActionState> {
  const parsed = updateVersionSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    versionId: formData.get("versionId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    effectiveDate: formData.get("effectiveDate") ?? "",
    status: formData.get("status"),
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

  const versionRepository = new DrizzleVersionRepository();
  const version = await versionRepository.findById(parsed.data.versionId);
  if (!version || version.projectId !== project.id) {
    return { error: "バージョンが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await updateVersion(
      { versionRepository },
      {
        versionId: parsed.data.versionId,
        name: parsed.data.name,
        description: parsed.data.description,
        effectiveDate: parsed.data.effectiveDate.length > 0 ? parsed.data.effectiveDate : null,
        status: parsed.data.status,
        wikiPageTitle: version.wikiPageTitle,
      },
    );
  } catch (error) {
    if (error instanceof InvalidVersionError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/versions`);
  return { error: null };
}

const deleteVersionSchema = z.object({
  projectIdentifier: z.string().min(1),
  versionId: z.string().min(1),
});

export async function deleteVersionAction(_prevState: VersionActionState, formData: FormData): Promise<VersionActionState> {
  const parsed = deleteVersionSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    versionId: formData.get("versionId"),
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

  const versionRepository = new DrizzleVersionRepository();
  const version = await versionRepository.findById(parsed.data.versionId);
  if (!version || version.projectId !== project.id) {
    return { error: "バージョンが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await deleteVersion({ versionRepository }, parsed.data.versionId);
  } catch (error) {
    if (error instanceof VersionNotDeletableError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/versions`);
  return { error: null };
}
