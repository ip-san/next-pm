"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { copyTrackerWorkflow } from "@/application/trackers/copy-tracker-workflow";
import { deleteTracker, TrackerNotDeletableError } from "@/application/trackers/delete-tracker";
import { nextPosition, resolveMove } from "@/domain/ordering/positioned";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { positionMoveValues, type AdminActionState } from "./admin-action-state";

export type { AdminActionState } from "./admin-action-state";

const trackerAttributesSchema = z.object({
  name: z.string().min(1).max(30),
  defaultStatusId: z.string().uuid("既定のステータスを選択してください。"),
  isInRoadmap: z.coerce.boolean().default(false),
});

function attributesFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    defaultStatusId: formData.get("defaultStatusId"),
    isInRoadmap: formData.get("isInRoadmap") === "on",
  };
}

async function assertStatusExists(defaultStatusId: string): Promise<string | null> {
  const status = await new DrizzleIssueStatusRepository().findById(defaultStatusId);
  return status ? null : "既定のステータスが見つかりません。";
}

export async function createTrackerAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = trackerAttributesSchema.safeParse(attributesFrom(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  const statusError = await assertStatusExists(parsed.data.defaultStatusId);
  if (statusError) {
    return { error: statusError };
  }

  const repository = new DrizzleTrackerRepository();
  const created = await repository.create({ ...parsed.data, position: nextPosition(await repository.listAll()) });

  // Redmine's TrackersController#create runs copy_workflow_rules after the save, so the new
  // tracker starts from an existing tracker's workflow instead of an empty one.
  const copyWorkflowFrom = formData.get("copyWorkflowFrom");
  if (typeof copyWorkflowFrom === "string" && copyWorkflowFrom.length > 0) {
    await copyTrackerWorkflow(
      {
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      copyWorkflowFrom,
      created.id,
    );
  }

  revalidatePath("/admin/trackers");
  revalidatePath("/admin/workflows");
  return { error: null };
}

const updateTrackerSchema = trackerAttributesSchema.extend({ trackerId: z.string().uuid() });

export async function updateTrackerAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateTrackerSchema.safeParse({
    ...attributesFrom(formData),
    trackerId: formData.get("trackerId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const { trackerId, ...attributes } = parsed.data;
  const repository = new DrizzleTrackerRepository();
  if (!(await repository.findById(trackerId))) {
    return { error: "トラッカーが見つかりません。" };
  }
  const statusError = await assertStatusExists(attributes.defaultStatusId);
  if (statusError) {
    return { error: statusError };
  }
  await repository.update(trackerId, attributes);

  revalidatePath("/admin/trackers");
  return { error: null };
}

const trackerIdSchema = z.object({ trackerId: z.string().uuid() });

export async function deleteTrackerAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = trackerIdSchema.safeParse({ trackerId: formData.get("trackerId") });
  if (!parsed.success) {
    return { error: "トラッカーが見つかりません。" };
  }

  try {
    await deleteTracker({ trackerAdminRepository: new DrizzleTrackerRepository() }, parsed.data.trackerId);
  } catch (error) {
    if (error instanceof TrackerNotDeletableError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/trackers");
  return { error: null };
}

const reorderTrackerSchema = trackerIdSchema.extend({ move: z.enum(positionMoveValues) });

export async function reorderTrackerAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = reorderTrackerSchema.safeParse({
    trackerId: formData.get("trackerId"),
    move: formData.get("move"),
  });
  if (!parsed.success) {
    return { error: "並べ替えの指定が不正です。" };
  }

  const repository = new DrizzleTrackerRepository();
  await repository.updatePositions(resolveMove(await repository.listAll(), parsed.data.trackerId, parsed.data.move));

  revalidatePath("/admin/trackers");
  return { error: null };
}

const copyWorkflowSchema = z.object({
  trackerId: z.string().uuid(),
  sourceTrackerId: z.string().uuid("コピー元のトラッカーを選択してください。"),
});

/** Mirrors `WorkflowRule.copy(source_tracker, nil, target_tracker, nil)` for an existing tracker. */
export async function copyTrackerWorkflowAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = copyWorkflowSchema.safeParse({
    trackerId: formData.get("trackerId"),
    sourceTrackerId: formData.get("sourceTrackerId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const repository = new DrizzleTrackerRepository();
  const found = await repository.findByIds([parsed.data.trackerId, parsed.data.sourceTrackerId]);
  if (found.length !== new Set([parsed.data.trackerId, parsed.data.sourceTrackerId]).size) {
    return { error: "トラッカーが見つかりません。" };
  }

  await copyTrackerWorkflow(
    {
      workflowRepository: new DrizzleWorkflowRepository(),
      workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
    },
    parsed.data.sourceTrackerId,
    parsed.data.trackerId,
  );

  revalidatePath("/admin/trackers");
  revalidatePath("/admin/workflows");
  return { error: null };
}
