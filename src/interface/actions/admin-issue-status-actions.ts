"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteIssueStatus, IssueStatusNotDeletableError } from "@/application/issue-statuses/delete-issue-status";
import { nextPosition, resolveMove } from "@/domain/ordering/positioned";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { positionMoveValues, type AdminActionState } from "./admin-action-state";

export type { AdminActionState } from "./admin-action-state";

/** `IssueStatus#default_done_ratio` is validated as 0..100 or nil — an empty input means nil. */
const doneRatioField = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : Number(value)))
  .refine((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 100), {
    message: "既定の進捗率は0〜100の整数で入力してください。",
  });

const issueStatusAttributesSchema = z.object({
  name: z.string().min(1).max(30),
  description: z.string().max(255).default(""),
  isClosed: z.coerce.boolean().default(false),
  defaultDoneRatio: doneRatioField,
});

function attributesFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    isClosed: formData.get("isClosed") === "on",
    defaultDoneRatio: formData.get("defaultDoneRatio") ?? "",
  };
}

export async function createIssueStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = issueStatusAttributesSchema.safeParse(attributesFrom(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const repository = new DrizzleIssueStatusRepository();
  await repository.create({ ...parsed.data, position: nextPosition(await repository.listAll()) });

  revalidatePath("/admin/issue-statuses");
  return { error: null };
}

const updateIssueStatusSchema = issueStatusAttributesSchema.extend({ statusId: z.string().uuid() });

export async function updateIssueStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateIssueStatusSchema.safeParse({ ...attributesFrom(formData), statusId: formData.get("statusId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const { statusId, ...attributes } = parsed.data;
  const repository = new DrizzleIssueStatusRepository();
  if (!(await repository.findById(statusId))) {
    return { error: "ステータスが見つかりません。" };
  }
  await repository.update(statusId, attributes);

  revalidatePath("/admin/issue-statuses");
  return { error: null };
}

const issueStatusIdSchema = z.object({ statusId: z.string().uuid() });

export async function deleteIssueStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = issueStatusIdSchema.safeParse({ statusId: formData.get("statusId") });
  if (!parsed.success) {
    return { error: "ステータスが見つかりません。" };
  }

  try {
    await deleteIssueStatus({ issueStatusRepository: new DrizzleIssueStatusRepository() }, parsed.data.statusId);
  } catch (error) {
    if (error instanceof IssueStatusNotDeletableError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/issue-statuses");
  return { error: null };
}

const reorderIssueStatusSchema = issueStatusIdSchema.extend({ move: z.enum(positionMoveValues) });

export async function reorderIssueStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = reorderIssueStatusSchema.safeParse({
    statusId: formData.get("statusId"),
    move: formData.get("move"),
  });
  if (!parsed.success) {
    return { error: "並べ替えの指定が不正です。" };
  }

  const repository = new DrizzleIssueStatusRepository();
  await repository.updatePositions(resolveMove(await repository.listAll(), parsed.data.statusId, parsed.data.move));

  revalidatePath("/admin/issue-statuses");
  return { error: null };
}
