"use server";

import { submittedCustomValue } from "@/interface/http/custom-field-form-value";
import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { CustomFieldValidationError } from "@/application/projects/set-project-custom-field-values";
import { setVersionCustomFieldValues, validateVersionCustomFieldValues } from "@/application/versions/set-version-custom-field-values";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { createVersion, InvalidVersionError } from "@/application/versions/create-version";
import { updateVersion } from "@/application/versions/update-version";
import { deleteVersion, VersionNotDeletableError } from "@/application/versions/delete-version";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
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
  sharing: z.enum(["none", "descendants", "hierarchy", "tree", "system"]),
  customFieldIds: z.array(z.string().uuid()).default([]),
});

/** The Version custom field values the form submitted, keyed by field id. A field the viewer can't see is dropped in the write. */
function versionCustomFieldValuesFrom(formData: FormData, customFieldIds: string[]): Record<string, string> {
  return Object.fromEntries(customFieldIds.map((fieldId) => [fieldId, submittedCustomValue(formData.getAll(`customField_${fieldId}`))]));
}

export async function createVersionAction(_prevState: VersionActionState, formData: FormData): Promise<VersionActionState> {
  const parsed = createVersionSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    effectiveDate: formData.get("effectiveDate") ?? "",
    sharing: formData.get("sharing") ?? "none",
    customFieldIds: formData.getAll("customFieldIds"),
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

  const { actor, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  const customFieldValues = versionCustomFieldValuesFrom(formData, parsed.data.customFieldIds);
  const viewer = customFieldViewerFor(user, roleIds);
  try {
    await validateVersionCustomFieldValues(new DrizzleCustomFieldRepository(), customFieldValues, viewer);
  } catch (error) {
    if (error instanceof CustomFieldValidationError) {
      return { error: Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの入力内容を確認してください。" };
    }
    throw error;
  }

  let createdId: string;
  try {
    const created = await createVersion(
      { versionRepository: new DrizzleVersionRepository() },
      {
        projectId: project.id,
        name: parsed.data.name,
        description: parsed.data.description,
        effectiveDate: parsed.data.effectiveDate.length > 0 ? parsed.data.effectiveDate : null,
        sharing: parsed.data.sharing,
        wikiPageTitle: null,
      },
    );
    createdId = created.id;
  } catch (error) {
    if (error instanceof InvalidVersionError) {
      return { error: error.message };
    }
    throw error;
  }

  if (parsed.data.customFieldIds.length > 0) {
    try {
      await setVersionCustomFieldValues(
        { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
        createdId,
        customFieldValues,
        viewer,
      );
    } catch (error) {
      if (error instanceof CustomFieldValidationError) {
        return { error: Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの入力内容を確認してください。" };
      }
      throw error;
    }
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
  sharing: z.enum(["none", "descendants", "hierarchy", "tree", "system"]),
  customFieldIds: z.array(z.string().uuid()).default([]),
});

export async function updateVersionAction(_prevState: VersionActionState, formData: FormData): Promise<VersionActionState> {
  const parsed = updateVersionSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    versionId: formData.get("versionId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    effectiveDate: formData.get("effectiveDate") ?? "",
    status: formData.get("status"),
    sharing: formData.get("sharing") ?? "none",
    customFieldIds: formData.getAll("customFieldIds"),
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

  const { actor, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  const customFieldValues = versionCustomFieldValuesFrom(formData, parsed.data.customFieldIds);
  const viewer = customFieldViewerFor(user, roleIds);
  try {
    await validateVersionCustomFieldValues(new DrizzleCustomFieldRepository(), customFieldValues, viewer);
  } catch (error) {
    if (error instanceof CustomFieldValidationError) {
      return { error: Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの入力内容を確認してください。" };
    }
    throw error;
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
        sharing: parsed.data.sharing,
        wikiPageTitle: version.wikiPageTitle,
      },
    );
  } catch (error) {
    if (error instanceof InvalidVersionError) {
      return { error: error.message };
    }
    throw error;
  }

  if (parsed.data.customFieldIds.length > 0) {
    try {
      await setVersionCustomFieldValues(
        { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
        parsed.data.versionId,
        customFieldValues,
        viewer,
      );
    } catch (error) {
      if (error instanceof CustomFieldValidationError) {
        return { error: Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの入力内容を確認してください。" };
      }
      throw error;
    }
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
    await deleteVersion({ versionRepository, attachmentRepository: new DrizzleAttachmentRepository() }, parsed.data.versionId);
  } catch (error) {
    if (error instanceof VersionNotDeletableError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/versions`);
  return { error: null };
}
