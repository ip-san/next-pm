"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { copyProject } from "@/application/projects/copy-project";
import { createProject } from "@/application/projects/create-project";
import { updateProject } from "@/application/projects/update-project";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const AVAILABLE_MODULES = ["issue_tracking", "time_tracking", "wiki", "boards", "news", "documents", "files", "repository"] as const;

const createProjectSchema = z.object({
  name: z.string().min(1),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "半角英数字・ハイフン・アンダースコアのみ使用できます"),
  description: z.string().default(""),
  isPublic: z.coerce.boolean().default(true),
  parentId: z.string().uuid().nullable(),
  enabledModules: z.array(z.enum(AVAILABLE_MODULES)).default([]),
  trackerIds: z.array(z.string().uuid()).default([]),
});

export type CreateProjectActionState = {
  error: string | null;
};

export async function createProjectAction(
  _prevState: CreateProjectActionState,
  formData: FormData,
): Promise<CreateProjectActionState> {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    return { error: "この操作を行う権限がありません。" };
  }

  const parentIdRaw = formData.get("parentId");
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    identifier: formData.get("identifier"),
    description: formData.get("description") ?? "",
    isPublic: formData.get("isPublic") === "on",
    parentId: parentIdRaw ? parentIdRaw : null,
    enabledModules: formData.getAll("enabledModules"),
    trackerIds: formData.getAll("trackerIds"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  let identifier: string;
  try {
    const project = await createProject(new DrizzleProjectRepository(), parsed.data);
    identifier = project.identifier;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "プロジェクトを作成できませんでした。" };
  }

  redirect(`/projects/${identifier}`);
}

const copyProjectSchema = z.object({
  sourceProjectId: z.string().uuid(),
  name: z.string().min(1),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "半角英数字・ハイフン・アンダースコアのみ使用できます"),
  description: z.string().default(""),
  isPublic: z.coerce.boolean().default(true),
  parentId: z.string().uuid().nullable(),
  enabledModules: z.array(z.enum(AVAILABLE_MODULES)).default([]),
  trackerIds: z.array(z.string().uuid()).default([]),
});

export type CopyProjectActionState = {
  error: string | null;
};

// Mirrors Redmine's ProjectsController#copy, which gates :copy on require_admin (a stricter
// check than the add_project/manage_project permissions the rest of project creation uses
// here) — so this uses the same isAdmin gate as createProjectAction/NewProjectPage rather
// than resolveActor/can.
export async function copyProjectAction(
  _prevState: CopyProjectActionState,
  formData: FormData,
): Promise<CopyProjectActionState> {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    return { error: "この操作を行う権限がありません。" };
  }

  const parentIdRaw = formData.get("parentId");
  const parsed = copyProjectSchema.safeParse({
    sourceProjectId: formData.get("sourceProjectId"),
    name: formData.get("name"),
    identifier: formData.get("identifier"),
    description: formData.get("description") ?? "",
    isPublic: formData.get("isPublic") === "on",
    parentId: parentIdRaw ? parentIdRaw : null,
    enabledModules: formData.getAll("enabledModules"),
    trackerIds: formData.getAll("trackerIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  let identifier: string;
  try {
    const project = await copyProject(new DrizzleProjectRepository(), parsed.data);
    identifier = project.identifier;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "プロジェクトをコピーできませんでした。" };
  }

  redirect(`/projects/${identifier}`);
}

const updateProjectSettingsSchema = z.object({
  projectIdentifier: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  isPublic: z.coerce.boolean().default(false),
  enabledModules: z.array(z.enum(AVAILABLE_MODULES)).default([]),
  trackerIds: z.array(z.string().uuid()).default([]),
});

export type UpdateProjectSettingsActionState = {
  error: string | null;
};

export async function updateProjectSettingsAction(
  _prevState: UpdateProjectSettingsActionState,
  formData: FormData,
): Promise<UpdateProjectSettingsActionState> {
  const parsed = updateProjectSettingsSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    isPublic: formData.get("isPublic") === "on",
    enabledModules: formData.getAll("enabledModules"),
    trackerIds: formData.getAll("trackerIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_project", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await updateProject(projectRepository, project.id, {
    name: parsed.data.name,
    description: parsed.data.description,
    isPublic: parsed.data.isPublic,
    enabledModules: parsed.data.enabledModules,
    trackerIds: parsed.data.trackerIds,
  });

  revalidatePath(`/projects/${parsed.data.projectIdentifier}`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/settings`);
  return { error: null };
}
