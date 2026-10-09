"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { parseFieldPermissionEntries } from "@/domain/workflow/parse-field-permissions";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import type { AdminActionState } from "./admin-action-state";
import { localizeError } from "@/interface/http/localize-error";

export type { AdminActionState } from "./admin-action-state";

const updateWorkflowSchema = z.object({
  trackerId: z.string().uuid(),
  roleId: z.string().uuid(),
  transitions: z.array(z.string()),
});

export async function updateWorkflowAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: await localizeError(authError) };
  }

  const parsed = updateWorkflowSchema.safeParse({
    trackerId: formData.get("trackerId"),
    roleId: formData.get("roleId"),
    transitions: formData.getAll("transitions"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const [tracker, role, statuses] = await Promise.all([
    new DrizzleTrackerRepository().findById(parsed.data.trackerId),
    new DrizzleRoleRepository().findById(parsed.data.roleId),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  if (!tracker || !role) {
    return { error: await localizeError("トラッカーまたはロールが見つかりません。") };
  }

  const statusIds = new Set(statuses.map((s) => s.id));
  const transitions: Array<{ oldStatusId: string; newStatusId: string; author: boolean; assignee: boolean }> = [];
  for (const pair of parsed.data.transitions) {
    const [oldStatusId, newStatusId] = pair.split(":");
    if (!oldStatusId || !newStatusId || !statusIds.has(oldStatusId) || !statusIds.has(newStatusId)) {
      return { error: await localizeError("不正な遷移が指定されました。") };
    }
    transitions.push({ oldStatusId, newStatusId, author: false, assignee: false });
  }

  await new DrizzleWorkflowRepository().replaceForTrackerAndRole(tracker.id, role.id, transitions);

  revalidatePath("/admin/workflows");
  return { error: null };
}

const updateFieldPermissionsSchema = z.object({
  trackerId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export async function updateFieldPermissionsAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: await localizeError(authError) };
  }

  const parsed = updateFieldPermissionsSchema.safeParse({
    trackerId: formData.get("trackerId"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const [tracker, role, statuses] = await Promise.all([
    new DrizzleTrackerRepository().findById(parsed.data.trackerId),
    new DrizzleRoleRepository().findById(parsed.data.roleId),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  if (!tracker || !role) {
    return { error: await localizeError("トラッカーまたはロールが見つかりません。") };
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") entries.push([key, value]);
  }
  const parsedPermissions = parseFieldPermissionEntries(entries, new Set(statuses.map((s) => s.id)));
  if (!parsedPermissions.ok) {
    return { error: await localizeError(parsedPermissions.error) };
  }

  await new DrizzleWorkflowFieldPermissionRepository().replaceForTrackerAndRole(
    tracker.id,
    role.id,
    parsedPermissions.permissions,
  );

  revalidatePath("/admin/workflows");
  return { error: null };
}

