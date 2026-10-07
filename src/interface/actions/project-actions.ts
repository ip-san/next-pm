"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PROJECT_MODULES } from "@/domain/authorization/permission-registry";
import { can } from "@/domain/authorization/authorization-service";
import { copyProject } from "@/application/projects/copy-project";
import { createProject } from "@/application/projects/create-project";
import { CustomFieldValidationError, setProjectCustomFieldValues } from "@/application/projects/set-project-custom-field-values";
import {
  archiveProject,
  closeProject,
  ProjectArchiveBlockedError,
  ProjectStatusChangeNotPermittedError,
  reopenProject,
  unarchiveProject,
} from "@/application/projects/project-status";
import { updateProject } from "@/application/projects/update-project";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";


const createProjectSchema = z.object({
  name: z.string().min(1),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "半角英数字・ハイフン・アンダースコアのみ使用できます"),
  description: z.string().default(""),
  isPublic: z.coerce.boolean().default(true),
  parentId: z.string().uuid().nullable(),
  enabledModules: z.array(z.enum(PROJECT_MODULES)).default([]),
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
  enabledModules: z.array(z.enum(PROJECT_MODULES)).default([]),
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
  enabledModules: z.array(z.enum(PROJECT_MODULES)).default([]),
  trackerIds: z.array(z.string().uuid()).default([]),
  customFieldIds: z.array(z.string().uuid()).default([]),
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
    customFieldIds: formData.getAll("customFieldIds"),
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

  if (parsed.data.customFieldIds.length > 0) {
    const rawValues = Object.fromEntries(
      parsed.data.customFieldIds.map((fieldId) => [fieldId, (formData.get(`customField_${fieldId}`) ?? "").toString()]),
    );
    try {
      await setProjectCustomFieldValues(
        { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
        project.id,
        rawValues,
      );
    } catch (error) {
      if (error instanceof CustomFieldValidationError) {
        return { error: Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの入力内容を確認してください。" };
      }
      throw error;
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/settings`);
  return { error: null };
}

export type ProjectStatusActionState = {
  error: string | null;
};

const projectStatusSchema = z.object({ projectIdentifier: z.string().min(1) });

/**
 * One body for the four status transitions, because the Server Action plumbing around them
 * is identical and only the use case differs — the rules themselves (who may act, which
 * projects move, what they move to) all live in application/projects/project-status.ts.
 * Each transition still gets its own exported `async function`: a `use server` module may
 * only export those, not a value a factory returned.
 */
async function changeProjectStatus(
  transition: "archive" | "unarchive" | "close" | "reopen",
  formData: FormData,
): Promise<ProjectStatusActionState> {
  const parsed = projectStatusSchema.safeParse({ projectIdentifier: formData.get("projectIdentifier") });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。" };
  }

  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  try {
    if (transition === "archive") {
      await archiveProject(
        { projectRepository, versionRepository: new DrizzleVersionRepository(), issueRepository: new DrizzleIssueRepository() },
        { projectId: project.id, isAdmin: user.isAdmin },
      );
    } else if (transition === "unarchive") {
      await unarchiveProject({ projectRepository }, { projectId: project.id, isAdmin: user.isAdmin });
    } else {
      const { actor } = await resolveActor(user, project.id);
      const change = transition === "close" ? closeProject : reopenProject;
      await change({ projectRepository }, { projectId: project.id, actor });
    }
  } catch (error) {
    if (error instanceof ProjectStatusChangeNotPermittedError) {
      return { error: "この操作を行う権限がありません。" };
    }
    if (error instanceof ProjectArchiveBlockedError) {
      return { error: "このプロジェクトのバージョンを使用しているチケットが配下以外のプロジェクトにあるため、アーカイブできません。" };
    }
    throw error;
  }

  // A status change moves a whole subtree and governs what every page under it may do, so
  // the dashboard segment is revalidated wholesale rather than the one project's paths.
  revalidatePath("/admin");
  revalidatePath("/projects", "layout");
  return { error: null };
}

export async function archiveProjectAction(_prevState: ProjectStatusActionState, formData: FormData): Promise<ProjectStatusActionState> {
  return changeProjectStatus("archive", formData);
}

export async function unarchiveProjectAction(_prevState: ProjectStatusActionState, formData: FormData): Promise<ProjectStatusActionState> {
  return changeProjectStatus("unarchive", formData);
}

export async function closeProjectAction(_prevState: ProjectStatusActionState, formData: FormData): Promise<ProjectStatusActionState> {
  return changeProjectStatus("close", formData);
}

export async function reopenProjectAction(_prevState: ProjectStatusActionState, formData: FormData): Promise<ProjectStatusActionState> {
  return changeProjectStatus("reopen", formData);
}
