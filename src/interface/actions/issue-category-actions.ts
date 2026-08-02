"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type IssueCategoryActionState = {
  error: string | null;
};

/** A category's default assignee must be a current project member — same rule the issue form's own assignee dropdown follows. */
async function assertAssignableOrNull(projectId: string, assignedToId: string | null): Promise<string | null> {
  if (!assignedToId) return null;
  const members = await new DrizzleMemberRepository().listByProject(projectId);
  if (!memberUserIds(members).includes(assignedToId)) {
    return "指定された担当者はこのプロジェクトのメンバーではありません。";
  }
  return null;
}

const createIssueCategorySchema = z.object({
  projectIdentifier: z.string().min(1),
  name: z.string().min(1).max(30),
  assignedToId: z.string().uuid().nullable(),
});

export async function createIssueCategoryAction(_prevState: IssueCategoryActionState, formData: FormData): Promise<IssueCategoryActionState> {
  const assignedToRaw = formData.get("assignedToId");
  const parsed = createIssueCategorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    name: formData.get("name"),
    assignedToId: assignedToRaw ? assignedToRaw : null,
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
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  const assigneeError = await assertAssignableOrNull(project.id, parsed.data.assignedToId);
  if (assigneeError) {
    return { error: assigneeError };
  }

  await new DrizzleIssueCategoryRepository().create({ projectId: project.id, name: parsed.data.name, assignedToId: parsed.data.assignedToId });

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issue-categories`);
  return { error: null };
}

const updateIssueCategorySchema = z.object({
  projectIdentifier: z.string().min(1),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(30),
  assignedToId: z.string().uuid().nullable(),
});

export async function updateIssueCategoryAction(_prevState: IssueCategoryActionState, formData: FormData): Promise<IssueCategoryActionState> {
  const assignedToRaw = formData.get("assignedToId");
  const parsed = updateIssueCategorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    assignedToId: assignedToRaw ? assignedToRaw : null,
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

  const categoryRepository = new DrizzleIssueCategoryRepository();
  const category = await categoryRepository.findById(parsed.data.categoryId);
  if (!category || category.projectId !== project.id) {
    return { error: "カテゴリが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  const assigneeError = await assertAssignableOrNull(project.id, parsed.data.assignedToId);
  if (assigneeError) {
    return { error: assigneeError };
  }

  await categoryRepository.update(parsed.data.categoryId, { name: parsed.data.name, assignedToId: parsed.data.assignedToId });

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issue-categories`);
  return { error: null };
}

const deleteIssueCategorySchema = z.object({
  projectIdentifier: z.string().min(1),
  categoryId: z.string().uuid(),
});

export async function deleteIssueCategoryAction(_prevState: IssueCategoryActionState, formData: FormData): Promise<IssueCategoryActionState> {
  const parsed = deleteIssueCategorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    categoryId: formData.get("categoryId"),
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

  const categoryRepository = new DrizzleIssueCategoryRepository();
  const category = await categoryRepository.findById(parsed.data.categoryId);
  if (!category || category.projectId !== project.id) {
    return { error: "カテゴリが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  // Mirrors the REST route: issues assigned to this category simply lose it (no reassignment
  // UI in this first slice), handled inside the repository's delete (nulls category_id first).
  await categoryRepository.delete(parsed.data.categoryId);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issue-categories`);
  return { error: null };
}
