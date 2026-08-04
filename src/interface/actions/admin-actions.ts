"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { customFieldFormatEnum } from "@/infrastructure/db/schema/custom-fields";
import { enumerationTypeEnum } from "@/infrastructure/db/schema/enumerations";
import { coerceCustomFieldValue } from "@/domain/custom-field/coerce";
import { isPermissionRegistered } from "@/domain/authorization/permission-registry";
import { generateSalt, hashPassword } from "@/domain/user/password";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { parseRolePermissionEntries } from "@/domain/role/parse-role-permissions";
import { parseFieldPermissionEntries } from "@/domain/workflow/parse-field-permissions";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { requireAdmin } from "@/interface/http/require-admin";

export type AdminActionState = {
  error: string | null;
};

const createIssueStatusSchema = z.object({
  name: z.string().min(1).max(30),
  isClosed: z.coerce.boolean().default(false),
});

export async function createIssueStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createIssueStatusSchema.safeParse({
    name: formData.get("name"),
    isClosed: formData.get("isClosed") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await new DrizzleIssueStatusRepository().create({
    name: parsed.data.name,
    description: "",
    isClosed: parsed.data.isClosed,
    defaultDoneRatio: null,
    position: 0,
  });

  revalidatePath("/admin/issue-statuses");
  return { error: null };
}

const createTrackerSchema = z.object({
  name: z.string().min(1),
  defaultStatusId: z.string().uuid("既定のステータスを選択してください。"),
});

export async function createTrackerAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createTrackerSchema.safeParse({
    name: formData.get("name"),
    defaultStatusId: formData.get("defaultStatusId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await new DrizzleTrackerRepository().create({
    name: parsed.data.name,
    defaultStatusId: parsed.data.defaultStatusId,
    position: 0,
    isInRoadmap: true,
  });

  revalidatePath("/admin/trackers");
  return { error: null };
}

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
    return { error: authError };
  }

  const parsed = updateWorkflowSchema.safeParse({
    trackerId: formData.get("trackerId"),
    roleId: formData.get("roleId"),
    transitions: formData.getAll("transitions"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const [tracker, role, statuses] = await Promise.all([
    new DrizzleTrackerRepository().findById(parsed.data.trackerId),
    new DrizzleRoleRepository().findById(parsed.data.roleId),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  if (!tracker || !role) {
    return { error: "トラッカーまたはロールが見つかりません。" };
  }

  const statusIds = new Set(statuses.map((s) => s.id));
  const transitions: Array<{ oldStatusId: string; newStatusId: string; author: boolean; assignee: boolean }> = [];
  for (const pair of parsed.data.transitions) {
    const [oldStatusId, newStatusId] = pair.split(":");
    if (!oldStatusId || !newStatusId || !statusIds.has(oldStatusId) || !statusIds.has(newStatusId)) {
      return { error: "不正な遷移が指定されました。" };
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
    return { error: authError };
  }

  const parsed = updateFieldPermissionsSchema.safeParse({
    trackerId: formData.get("trackerId"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const [tracker, role, statuses] = await Promise.all([
    new DrizzleTrackerRepository().findById(parsed.data.trackerId),
    new DrizzleRoleRepository().findById(parsed.data.roleId),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  if (!tracker || !role) {
    return { error: "トラッカーまたはロールが見つかりません。" };
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") entries.push([key, value]);
  }
  const parsedPermissions = parseFieldPermissionEntries(entries, new Set(statuses.map((s) => s.id)));
  if (!parsedPermissions.ok) {
    return { error: parsedPermissions.error };
  }

  await new DrizzleWorkflowFieldPermissionRepository().replaceForTrackerAndRole(
    tracker.id,
    role.id,
    parsedPermissions.permissions,
  );

  revalidatePath("/admin/workflows");
  return { error: null };
}

const createEnumerationSchema = z.object({
  type: z.enum(enumerationTypeEnum),
  name: z.string().min(1).max(30),
  isDefault: z.coerce.boolean().default(false),
});

export async function createEnumerationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createEnumerationSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const enumerationRepository = new DrizzleEnumerationRepository();
  if (parsed.data.isDefault) {
    await enumerationRepository.unsetSystemDefaultsForType(parsed.data.type);
  }
  await enumerationRepository.create({
    type: parsed.data.type,
    name: parsed.data.name,
    position: 0,
    isDefault: parsed.data.isDefault,
    projectId: null,
    parentId: null,
  });

  revalidatePath("/admin/enumerations");
  return { error: null };
}

const createCustomFieldSchema = z.object({
  name: z.string().min(1).max(30),
  fieldFormat: z.enum(customFieldFormatEnum),
  possibleValues: z.string().default(""),
  defaultValue: z.string().default(""),
  isRequired: z.coerce.boolean().default(false),
  trackerIds: z.array(z.string().uuid()).default([]),
});

export async function createCustomFieldAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createCustomFieldSchema.safeParse({
    name: formData.get("name"),
    fieldFormat: formData.get("fieldFormat"),
    possibleValues: formData.get("possibleValues") ?? "",
    defaultValue: formData.get("defaultValue") ?? "",
    isRequired: formData.get("isRequired") === "on",
    trackerIds: formData.getAll("trackerIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  if (parsed.data.trackerIds.length === 0) {
    return { error: "対象トラッカーを1つ以上選択してください。" };
  }

  const trackers = await new DrizzleTrackerRepository().findByIds(parsed.data.trackerIds);
  if (trackers.length !== parsed.data.trackerIds.length) {
    return { error: "存在しないトラッカーが指定されました。" };
  }

  const possibleValues =
    parsed.data.fieldFormat === "list"
      ? parsed.data.possibleValues
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : [];
  if (parsed.data.fieldFormat === "list" && possibleValues.length === 0) {
    return { error: "リスト形式には選択肢を1つ以上指定してください。" };
  }

  let defaultValue: string | null = null;
  if (parsed.data.defaultValue.trim().length > 0) {
    const result = coerceCustomFieldValue(
      { name: parsed.data.name, fieldFormat: parsed.data.fieldFormat, isRequired: false, possibleValues },
      parsed.data.defaultValue,
    );
    if (!result.ok) {
      return { error: result.error };
    }
    defaultValue = result.value;
  }

  await new DrizzleCustomFieldRepository().create({
    name: parsed.data.name,
    fieldFormat: parsed.data.fieldFormat,
    isRequired: parsed.data.isRequired,
    defaultValue,
    possibleValues,
    position: 0,
    trackerIds: parsed.data.trackerIds,
  });

  revalidatePath("/admin/custom-fields");
  return { error: null };
}

const createUserSchema = z.object({
  login: z.string().min(1).max(30),
  mail: z.string().email("正しいメールアドレスを入力してください。"),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  password: z.string().min(8, "パスワードは8文字以上で入力してください。"),
  isAdmin: z.coerce.boolean().default(false),
});

export async function createUserAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createUserSchema.safeParse({
    login: formData.get("login"),
    mail: formData.get("mail"),
    firstname: formData.get("firstname"),
    lastname: formData.get("lastname"),
    password: formData.get("password"),
    isAdmin: formData.get("isAdmin") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const userRepository = new DrizzleUserRepository();
  const existingByLogin = await userRepository.findByLogin(parsed.data.login);
  if (existingByLogin) {
    return { error: "そのログインIDは既に使用されています。" };
  }

  const salt = generateSalt();
  try {
    await userRepository.create({
      login: parsed.data.login,
      mail: parsed.data.mail,
      firstname: parsed.data.firstname,
      lastname: parsed.data.lastname,
      isAdmin: parsed.data.isAdmin,
      status: "active",
      passwordSalt: salt,
      passwordHash: hashPassword(parsed.data.password, salt),
      mustChangePassword: true,
      apiKey: null,
      atomKey: null,
      authSource: null,
      twofaScheme: null,
      twofaTotpKey: null,
      twofaTotpLastUsedStep: null,
    });
  } catch (error) {
    // The mail column also carries a unique constraint (checked only at insert time,
    // unlike login above). drizzle-orm wraps the raw pg driver error in `.cause` rather
    // than surfacing its code/message directly, so unwrap that to detect it.
    const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    if (pgError instanceof Error && "code" in pgError && pgError.code === "23505") {
      return { error: "そのメールアドレスは既に使用されています。" };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  return { error: null };
}

const createRoleSchema = z.object({
  name: z.string().min(1).max(30),
  issuesVisibility: z.enum(["all", "default", "own"]).default("default"),
  permissions: z.array(z.string()),
});

export async function createRoleAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createRoleSchema.safeParse({
    name: formData.get("name"),
    issuesVisibility: formData.get("issuesVisibility") ?? "default",
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const invalidPermission = parsed.data.permissions.find((p) => !isPermissionRegistered(p));
  if (invalidPermission) {
    return { error: `不明な権限が指定されました: ${invalidPermission}` };
  }
  const permissions = parsed.data.permissions.filter(isPermissionRegistered);

  await new DrizzleRoleRepository().create({
    name: parsed.data.name,
    builtin: 0,
    position: 0,
    permissions,
    issuesVisibility: parsed.data.issuesVisibility,
    timeEntriesVisibility: "all",
    usersVisibility: "all",
    assignable: true,
  });

  revalidatePath("/admin/roles");
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

  for (const [roleId, permissions] of parsed.permissionsByRoleId) {
    await roleRepository.updatePermissions(roleId, permissions);
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/roles/permissions");
  return { error: null };
}
