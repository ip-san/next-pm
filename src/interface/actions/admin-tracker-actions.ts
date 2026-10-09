"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { copyTrackerWorkflow } from "@/application/trackers/copy-tracker-workflow";
import { deleteTracker, TrackerNotDeletableError } from "@/application/trackers/delete-tracker";
import { nextPosition, resolveMove } from "@/domain/ordering/positioned";
import { normalizeDisabledCoreFields, TRACKER_CORE_FIELDS, type TrackerCoreField } from "@/domain/tracker/core-fields";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { positionMoveValues, type AdminActionState } from "./admin-action-state";
import { localizeError } from "@/interface/http/localize-error";

export type { AdminActionState } from "./admin-action-state";

const trackerAttributesSchema = z.object({
  name: z.string().min(1).max(30),
  defaultStatusId: z.string().uuid("既定のステータスを選択してください。"),
  isInRoadmap: z.coerce.boolean().default(false),
  /**
   * The form submits the *enabled* fields (one checkbox per core field, checked = enabled),
   * exactly like Redmine's `tracker[core_fields][]`; the disabled set is the complement.
   */
  enabledCoreFields: z.array(z.string()).default([]),
});

function attributesFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    defaultStatusId: formData.get("defaultStatusId"),
    isInRoadmap: formData.get("isInRoadmap") === "on",
    enabledCoreFields: formData.getAll("coreFields"),
  };
}

function disabledCoreFieldsFrom(enabled: string[]): TrackerCoreField[] {
  const kept = new Set(enabled);
  return normalizeDisabledCoreFields(TRACKER_CORE_FIELDS.filter((field) => !kept.has(field)));
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
    return { error: await localizeError(authError) };
  }

  const parsed = trackerAttributesSchema.safeParse(attributesFrom(formData));
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }
  const statusError = await assertStatusExists(parsed.data.defaultStatusId);
  if (statusError) {
    return { error: await localizeError(statusError) };
  }

  const { enabledCoreFields, ...attributes } = parsed.data;
  const repository = new DrizzleTrackerRepository();
  const created = await repository.create({
    ...attributes,
    disabledCoreFields: disabledCoreFieldsFrom(enabledCoreFields),
    position: nextPosition(await repository.listAll()),
  });

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
    return { error: await localizeError(authError) };
  }

  const parsed = updateTrackerSchema.safeParse({
    ...attributesFrom(formData),
    trackerId: formData.get("trackerId"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const { trackerId, enabledCoreFields, ...attributes } = parsed.data;
  const repository = new DrizzleTrackerRepository();
  if (!(await repository.findById(trackerId))) {
    return { error: await localizeError("トラッカーが見つかりません。") };
  }
  const statusError = await assertStatusExists(attributes.defaultStatusId);
  if (statusError) {
    return { error: await localizeError(statusError) };
  }
  await repository.update(trackerId, {
    ...attributes,
    disabledCoreFields: disabledCoreFieldsFrom(enabledCoreFields),
  });

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
    return { error: await localizeError(authError) };
  }

  const parsed = trackerIdSchema.safeParse({ trackerId: formData.get("trackerId") });
  if (!parsed.success) {
    return { error: await localizeError("トラッカーが見つかりません。") };
  }

  try {
    await deleteTracker({ trackerAdminRepository: new DrizzleTrackerRepository() }, parsed.data.trackerId);
  } catch (error) {
    if (error instanceof TrackerNotDeletableError) {
      return { error: await localizeError(error.message) };
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
    return { error: await localizeError(authError) };
  }

  const parsed = reorderTrackerSchema.safeParse({
    trackerId: formData.get("trackerId"),
    move: formData.get("move"),
  });
  if (!parsed.success) {
    return { error: await localizeError("並べ替えの指定が不正です。") };
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
    return { error: await localizeError(authError) };
  }

  const parsed = copyWorkflowSchema.safeParse({
    trackerId: formData.get("trackerId"),
    sourceTrackerId: formData.get("sourceTrackerId"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const repository = new DrizzleTrackerRepository();
  const found = await repository.findByIds([parsed.data.trackerId, parsed.data.sourceTrackerId]);
  if (found.length !== new Set([parsed.data.trackerId, parsed.data.sourceTrackerId]).size) {
    return { error: await localizeError("トラッカーが見つかりません。") };
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
