"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { ArchiveBlockedError, archiveProject, unarchiveProject } from "@/application/projects/archive-project";
import { closeProject, reopenProject } from "@/application/projects/close-project";
import { createProject } from "@/application/projects/create-project";
import { updateProject } from "@/application/projects/update-project";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { requireAdmin } from "@/interface/http/require-admin";
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

export type ProjectLifecycleActionState = {
  error: string | null;
};

/** Shared close/reopen skeleton — both are the same permission check around a different use case. */
async function runCloseOrReopen(
  formData: FormData,
  run: (repository: DrizzleProjectRepository, projectId: string) => Promise<void>,
): Promise<ProjectLifecycleActionState> {
  const identifier = formData.get("projectIdentifier");
  if (typeof identifier !== "string" || identifier === "") {
    return { error: "入力内容を確認してください。" };
  }

  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findByIdentifier(identifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "close_project", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await run(projectRepository, project.id);

  revalidatePath(`/projects/${identifier}`);
  return { error: null };
}

export async function closeProjectAction(
  _prevState: ProjectLifecycleActionState,
  formData: FormData,
): Promise<ProjectLifecycleActionState> {
  return runCloseOrReopen(formData, closeProject);
}

export async function reopenProjectAction(
  _prevState: ProjectLifecycleActionState,
  formData: FormData,
): Promise<ProjectLifecycleActionState> {
  return runCloseOrReopen(formData, reopenProject);
}

export async function archiveProjectAction(
  _prevState: ProjectLifecycleActionState,
  formData: FormData,
): Promise<ProjectLifecycleActionState> {
  // Admin-only like Redmine's require_admin — deliberately NOT an authorization-service
  // check: `can` refuses everything on an archived project, which is exactly the state
  // this action manages.
  const denied = await requireAdmin();
  if (denied) {
    return { error: denied };
  }

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId === "") {
    return { error: "入力内容を確認してください。" };
  }

  try {
    await archiveProject(new DrizzleProjectRepository(), new DrizzleVersionRepository(), new DrizzleIssueRepository(), projectId);
  } catch (error) {
    if (error instanceof ArchiveBlockedError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/projects");
  return { error: null };
}

export async function unarchiveProjectAction(
  _prevState: ProjectLifecycleActionState,
  formData: FormData,
): Promise<ProjectLifecycleActionState> {
  const denied = await requireAdmin();
  if (denied) {
    return { error: denied };
  }

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string" || projectId === "") {
    return { error: "入力内容を確認してください。" };
  }

  await unarchiveProject(new DrizzleProjectRepository(), projectId);

  revalidatePath("/admin/projects");
  return { error: null };
}
