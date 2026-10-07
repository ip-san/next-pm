"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeUserStatus, UserStatusChangeError } from "@/application/users/change-user-status";
import { deleteUser, UserNotDeletableError } from "@/application/users/delete-user";
import { isMembershipEditable } from "@/domain/member/repository";
import { generateSalt, hashPassword } from "@/domain/user/password";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { requireAdmin } from "@/interface/http/require-admin";
import type { AdminActionState } from "./admin-action-state";

export type { AdminActionState } from "./admin-action-state";

const userAttributesSchema = z.object({
  login: z.string().min(1).max(30),
  mail: z.string().email("正しいメールアドレスを入力してください。"),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  isAdmin: z.coerce.boolean().default(false),
  /** Redmine's auth_source_id select: empty means a locally authenticated account. */
  authSource: z.enum(["", "ldap"]).transform((value) => (value === "" ? null : value)),
});

function attributesFrom(formData: FormData) {
  return {
    login: formData.get("login"),
    mail: formData.get("mail"),
    firstname: formData.get("firstname"),
    lastname: formData.get("lastname"),
    isAdmin: formData.get("isAdmin") === "on",
    authSource: formData.get("authSource") ?? "",
  };
}

/**
 * The mail column carries a unique constraint checked only at write time; drizzle-orm wraps the
 * raw pg driver error in `.cause` rather than surfacing its code directly, so unwrap to detect it.
 */
function duplicateMailError(error: unknown): boolean {
  const pgError = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return pgError instanceof Error && "code" in pgError && pgError.code === "23505";
}

export async function createUserAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = userAttributesSchema
    .extend({ password: z.string().min(8, "パスワードは8文字以上で入力してください。") })
    .safeParse({ ...attributesFrom(formData), password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const userRepository = new DrizzleUserRepository();
  if (await userRepository.findByLogin(parsed.data.login)) {
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
      authSource: parsed.data.authSource,
      twofaScheme: null,
      twofaTotpKey: null,
      twofaTotpLastUsedStep: null,
    });
  } catch (error) {
    if (duplicateMailError(error)) {
      return { error: "そのメールアドレスは既に使用されています。" };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  return { error: null };
}

const userIdSchema = z.object({ userId: z.string().uuid() });

export async function updateUserAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = userAttributesSchema
    .extend({ userId: z.string().uuid(), password: z.string() })
    .safeParse({ ...attributesFrom(formData), userId: formData.get("userId"), password: formData.get("password") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const userRepository = new DrizzleUserRepository();
  const existing = await userRepository.findById(parsed.data.userId);
  if (!existing || existing.status === "anonymous") {
    return { error: "ユーザーが見つかりません。" };
  }

  const byLogin = await userRepository.findByLogin(parsed.data.login);
  if (byLogin && byLogin.id !== existing.id) {
    return { error: "そのログインIDは既に使用されています。" };
  }

  // Redmine's users/_form hides the admin checkbox for User.current, so an admin cannot
  // demote themselves and lock the whole instance out of its own admin area.
  const actor = await currentUserFromCookies();
  const isAdmin = actor && actor.id === existing.id ? existing.isAdmin : parsed.data.isAdmin;

  try {
    await userRepository.update(existing.id, {
      login: parsed.data.login,
      mail: parsed.data.mail,
      firstname: parsed.data.firstname,
      lastname: parsed.data.lastname,
      isAdmin,
      authSource: parsed.data.authSource,
    });
  } catch (error) {
    if (duplicateMailError(error)) {
      return { error: "そのメールアドレスは既に使用されています。" };
    }
    throw error;
  }

  // UsersController#update only touches the password when one was submitted and the account
  // isn't delegated to a directory — an LDAP-backed user has no local hash to set.
  if (parsed.data.password.length > 0) {
    if (parsed.data.authSource === "ldap") {
      return { error: "LDAP認証のユーザーにはパスワードを設定できません。" };
    }
    if (parsed.data.password.length < 8) {
      return { error: "パスワードは8文字以上で入力してください。" };
    }
    const salt = generateSalt();
    await userRepository.updatePassword(existing.id, hashPassword(parsed.data.password, salt), salt);
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${existing.id}`);
  return { error: null };
}

const changeStatusSchema = userIdSchema.extend({ status: z.enum(["active", "registered", "locked"]) });

/** Covers Redmine's activate / lock / unlock buttons — unlock is just a move back to active. */
export async function changeUserStatusAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = changeStatusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。" };
  }

  const actor = await currentUserFromCookies();
  if (!actor) {
    return { error: "ログインしてください。" };
  }

  const userRepository = new DrizzleUserRepository();
  try {
    await changeUserStatus(
      { userRepository, userAdminRepository: userRepository },
      parsed.data.userId,
      parsed.data.status,
      actor.id,
    );
  } catch (error) {
    if (error instanceof UserStatusChangeError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { error: null };
}

export async function deleteUserAction(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: "ユーザーが見つかりません。" };
  }

  const actor = await currentUserFromCookies();
  if (!actor) {
    return { error: "ログインしてください。" };
  }

  const userRepository = new DrizzleUserRepository();
  try {
    await deleteUser({ userRepository, userAdminRepository: userRepository }, parsed.data.userId, actor.id);
  } catch (error) {
    if (error instanceof UserNotDeletableError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  return { error: null };
}

const addMembershipSchema = userIdSchema.extend({
  projectId: z.string().uuid("プロジェクトを選択してください。"),
  roleIds: z.array(z.string().uuid()).min(1, "ロールを1つ以上選択してください。"),
});

/** Mirrors PrincipalMembershipsController#create for a user principal. */
export async function addUserMembershipAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = addMembershipSchema.safeParse({
    userId: formData.get("userId"),
    projectId: formData.get("projectId"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const [user, project, roles] = await Promise.all([
    new DrizzleUserRepository().findById(parsed.data.userId),
    new DrizzleProjectRepository().findById(parsed.data.projectId),
    new DrizzleRoleRepository().findByIds(parsed.data.roleIds),
  ]);
  if (!user || user.status === "anonymous") {
    return { error: "ユーザーが見つかりません。" };
  }
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }
  // Redmine offers Role.find_all_givable, i.e. ordinary roles only — the builtin ones are
  // never handed to a project member.
  if (roles.length !== parsed.data.roleIds.length || roles.some((role) => role.builtin !== 0)) {
    return { error: "存在しないロールが指定されました。" };
  }

  const memberRepository = new DrizzleMemberRepository();
  if (await memberRepository.findDirectByUserAndProject(user.id, project.id)) {
    return { error: "既にこのプロジェクトのメンバーです。" };
  }

  await memberRepository.create({
    userId: user.id,
    groupId: null,
    inheritedFromMemberId: null,
    projectId: project.id,
    roleIds: parsed.data.roleIds,
  });

  revalidatePath(`/admin/users/${user.id}`);
  revalidatePath(`/projects/${project.identifier}/members`);
  return { error: null };
}

const membershipSchema = userIdSchema.extend({
  memberId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).default([]),
});

/** Mirrors PrincipalMembershipsController#update. */
export async function updateUserMembershipAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = membershipSchema.safeParse({
    userId: formData.get("userId"),
    memberId: formData.get("memberId"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。" };
  }
  if (parsed.data.roleIds.length === 0) {
    return { error: "ロールを1つ以上選択してください。" };
  }

  const memberRepository = new DrizzleMemberRepository();
  const membership = await memberRepository.findById(parsed.data.memberId);
  if (!membership || membership.userId !== parsed.data.userId) {
    return { error: "メンバーシップが見つかりません。" };
  }
  if (!isMembershipEditable(membership)) {
    return { error: "グループから継承したメンバーシップは編集できません。" };
  }

  const roles = await new DrizzleRoleRepository().findByIds(parsed.data.roleIds);
  if (roles.length !== parsed.data.roleIds.length || roles.some((role) => role.builtin !== 0)) {
    return { error: "存在しないロールが指定されました。" };
  }

  await memberRepository.replaceRoles(membership.id, parsed.data.roleIds);

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { error: null };
}

/** Mirrors PrincipalMembershipsController#destroy, which only acts when Member#deletable?. */
export async function removeUserMembershipAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = userIdSchema
    .extend({ memberId: z.string().uuid() })
    .safeParse({ userId: formData.get("userId"), memberId: formData.get("memberId") });
  if (!parsed.success) {
    return { error: "メンバーシップが見つかりません。" };
  }

  const memberRepository = new DrizzleMemberRepository();
  const membership = await memberRepository.findById(parsed.data.memberId);
  if (!membership || membership.userId !== parsed.data.userId) {
    return { error: "メンバーシップが見つかりません。" };
  }
  if (!isMembershipEditable(membership)) {
    return { error: "グループから継承したメンバーシップは削除できません。" };
  }

  await memberRepository.delete(membership.id);

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { error: null };
}
