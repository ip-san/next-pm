"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { copyRoleWorkflow } from "@/application/roles/copy-role-workflow";
import { deleteRole, RoleNotDeletableError } from "@/application/roles/delete-role";
import { isPermissionRegistered } from "@/domain/authorization/permission-registry";
import { nextPosition, resolveMove } from "@/domain/ordering/positioned";
import { ROLE_BUILTIN_MEMBER, isBuiltinRole, setablePermissions, type Role } from "@/domain/role/entity";
import { parseRolePermissionEntries } from "@/domain/role/parse-role-permissions";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { positionMoveValues, type AdminActionState } from "./admin-action-state";

export type { AdminActionState } from "./admin-action-state";

const visibilitySchema = z.object({
  issuesVisibility: z.enum(["all", "default", "own"]).default("default"),
  timeEntriesVisibility: z.enum(["all", "own"]).default("all"),
  usersVisibility: z.enum(["all", "members_of_visible_projects"]).default("all"),
  assignable: z.coerce.boolean().default(true),
});

const roleAttributesSchema = visibilitySchema.extend({
  name: z.string().min(1).max(30),
  permissions: z.array(z.string()),
});

function attributesFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    issuesVisibility: formData.get("issuesVisibility") ?? "default",
    timeEntriesVisibility: formData.get("timeEntriesVisibility") ?? "all",
    usersVisibility: formData.get("usersVisibility") ?? "all",
    assignable: formData.get("assignable") === "on",
    permissions: formData.getAll("permissions"),
  };
}

/**
 * Keeps a submitted permission set within what the role may hold. Beyond rejecting unknown
 * keys, this enforces Role#setable_permissions: the builtin Non member role can't take a
 * members-only permission and Anonymous can't take a logged-in-only one either.
 */
function resolvePermissions(
  submitted: string[],
  builtin: Role["builtin"],
): { ok: true; permissions: Role["permissions"] } | { ok: false; error: string } {
  const unknown = submitted.find((key) => !isPermissionRegistered(key));
  if (unknown) {
    return { ok: false, error: `不明な権限が指定されました: ${unknown}` };
  }
  const permissions = submitted.filter(isPermissionRegistered);
  const setable = new Set(setablePermissions(builtin));
  const notSetable = permissions.find((key) => !setable.has(key));
  if (notSetable) {
    return { ok: false, error: `このロールには設定できない権限です: ${notSetable}` };
  }
  return { ok: true, permissions };
}

export async function createRoleAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = roleAttributesSchema.safeParse(attributesFrom(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const permissions = resolvePermissions(parsed.data.permissions, ROLE_BUILTIN_MEMBER);
  if (!permissions.ok) {
    return { error: permissions.error };
  }

  const roleRepository = new DrizzleRoleRepository();
  const existing = await roleRepository.listAll();
  const created = await roleRepository.create({
    name: parsed.data.name,
    builtin: ROLE_BUILTIN_MEMBER,
    position: nextPosition(existing.filter((role) => !isBuiltinRole(role))),
    permissions: permissions.permissions,
    issuesVisibility: parsed.data.issuesVisibility,
    timeEntriesVisibility: parsed.data.timeEntriesVisibility,
    usersVisibility: parsed.data.usersVisibility,
    assignable: parsed.data.assignable,
  });

  // Redmine's RolesController#create runs copy_workflow_rules after the save.
  const copyWorkflowFrom = formData.get("copyWorkflowFrom");
  if (typeof copyWorkflowFrom === "string" && copyWorkflowFrom.length > 0) {
    const trackers = await new DrizzleTrackerRepository().listAll();
    await copyRoleWorkflow(
      {
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      trackers.map((tracker) => tracker.id),
      copyWorkflowFrom,
      created.id,
    );
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/workflows");
  return { error: null };
}

const roleIdSchema = z.object({ roleId: z.string().uuid() });

export async function updateRoleAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = roleAttributesSchema
    .extend({ roleId: z.string().uuid() })
    .safeParse({ ...attributesFrom(formData), roleId: formData.get("roleId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const roleRepository = new DrizzleRoleRepository();
  const existing = await roleRepository.findById(parsed.data.roleId);
  if (!existing) {
    return { error: "ロールが見つかりません。" };
  }

  const permissions = resolvePermissions(parsed.data.permissions, existing.builtin);
  if (!permissions.ok) {
    return { error: permissions.error };
  }

  await roleRepository.update(existing.id, {
    // A builtin role's name is fixed: Role.find_or_create_system_role recreates "Non member" /
    // "Anonymous" by builtin value, so renaming one would only confuse the admin screen.
    name: isBuiltinRole(existing) ? existing.name : parsed.data.name,
    permissions: permissions.permissions,
    issuesVisibility: parsed.data.issuesVisibility,
    timeEntriesVisibility: parsed.data.timeEntriesVisibility,
    usersVisibility: parsed.data.usersVisibility,
    assignable: isBuiltinRole(existing) ? existing.assignable : parsed.data.assignable,
  });

  revalidatePath("/admin/roles");
  revalidatePath("/admin/roles/permissions");
  return { error: null };
}

export async function deleteRoleAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = roleIdSchema.safeParse({ roleId: formData.get("roleId") });
  if (!parsed.success) {
    return { error: "ロールが見つかりません。" };
  }

  const roleRepository = new DrizzleRoleRepository();
  try {
    await deleteRole({ roleRepository, roleAdminRepository: roleRepository }, parsed.data.roleId);
  } catch (error) {
    if (error instanceof RoleNotDeletableError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/roles");
  return { error: null };
}

const reorderRoleSchema = roleIdSchema.extend({ move: z.enum(positionMoveValues) });

export async function reorderRoleAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = reorderRoleSchema.safeParse({ roleId: formData.get("roleId"), move: formData.get("move") });
  if (!parsed.success) {
    return { error: "並べ替えの指定が不正です。" };
  }

  const roleRepository = new DrizzleRoleRepository();
  const target = await roleRepository.findById(parsed.data.roleId);
  if (!target || isBuiltinRole(target)) {
    return { error: "ロールが見つかりません。" };
  }

  // `acts_as_positioned :scope => :builtin` — ordinary roles order among themselves.
  const siblings = (await roleRepository.listAll()).filter((role) => !isBuiltinRole(role));
  await roleRepository.updatePositions(resolveMove(siblings, target.id, parsed.data.move));

  revalidatePath("/admin/roles");
  return { error: null };
}

const copyRoleSchema = z.object({
  sourceRoleId: z.string().uuid(),
  name: z.string().min(1).max(30),
  copyWorkflow: z.coerce.boolean().default(false),
});

/**
 * Mirrors Redmine's `roles/new?copy=<id>` plus Role#copy_from: everything but id, name,
 * position and builtin is taken from the source, including its permission set. Workflow rules
 * are not part of copy_from, so copying them is the separate copy_workflow_from option.
 */
export async function copyRoleAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = copyRoleSchema.safeParse({
    sourceRoleId: formData.get("sourceRoleId"),
    name: formData.get("name"),
    copyWorkflow: formData.get("copyWorkflow") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const roleRepository = new DrizzleRoleRepository();
  const source = await roleRepository.findById(parsed.data.sourceRoleId);
  if (!source) {
    return { error: "コピー元のロールが見つかりません。" };
  }

  // The copy is always an ordinary role, so a builtin source's reduced permission set simply
  // carries over as-is — copy_from never widens it.
  const existing = await roleRepository.listAll();
  const created = await roleRepository.create({
    name: parsed.data.name,
    builtin: ROLE_BUILTIN_MEMBER,
    position: nextPosition(existing.filter((role) => !isBuiltinRole(role))),
    permissions: source.permissions,
    issuesVisibility: source.issuesVisibility,
    timeEntriesVisibility: source.timeEntriesVisibility,
    usersVisibility: source.usersVisibility,
    assignable: source.assignable,
  });

  if (parsed.data.copyWorkflow) {
    const trackers = await new DrizzleTrackerRepository().listAll();
    await copyRoleWorkflow(
      {
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      trackers.map((tracker) => tracker.id),
      source.id,
      created.id,
    );
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/workflows");
  return { error: null };
}

export async function updateRolePermissionsAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") entries.push([key, value]);
  }
  const parsed = parseRolePermissionEntries(entries);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const roleRepository = new DrizzleRoleRepository();
  const roleIds = Array.from(parsed.permissionsByRoleId.keys());
  const roles = await roleRepository.findByIds(roleIds);
  if (roles.length !== roleIds.length) {
    return { error: "存在しないロールが指定されました。" };
  }

  for (const role of roles) {
    const submitted = parsed.permissionsByRoleId.get(role.id) ?? [];
    const permissions = resolvePermissions(submitted, role.builtin);
    if (!permissions.ok) {
      return { error: permissions.error };
    }
    await roleRepository.updatePermissions(role.id, permissions.permissions);
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/roles/permissions");
  return { error: null };
}
