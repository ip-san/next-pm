"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import { addGroupToProject } from "@/application/groups/group-membership";
import {
  MemberRolesEmptyError,
  MemberRolesInvalidError,
  updateMemberRoles,
  UpdateMemberRolesNotPermittedError,
} from "@/application/members/update-member-roles";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { userVisibilityFor } from "@/interface/http/user-visibility";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type MemberActionState = {
  error: string | null;
};

type ManageMembersGuard = { error: string; project?: undefined } | { error?: undefined; project: Project };

async function requireManageMembers(projectIdentifier: string): Promise<ManageMembersGuard> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }
  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_members", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  return { project };
}

const addMemberSchema = z.object({
  projectIdentifier: z.string().min(1),
  login: z.string().min(1),
  roleIds: z.array(z.string().uuid()),
});

export async function addMemberAction(_prevState: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const parsed = addMemberSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    login: formData.get("login"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const guard = await requireManageMembers(parsed.data.projectIdentifier);
  if (!guard.project) {
    return { error: guard.error };
  }

  if (parsed.data.roleIds.length === 0) {
    return { error: "ロールを1つ以上選択してください。" };
  }

  const [targetUser, roles] = await Promise.all([
    new DrizzleUserRepository().findByLogin(parsed.data.login),
    // Role.givable, not findByIds: a crafted request must not be able to hand a member
    // the builtin Non member or Anonymous role.
    new DrizzleRoleRepository().listGivable(),
  ]);
  // Redmine only offers principals the acting user can see (members_helper's
  // render_principals_for_new_members uses Principal.visible). An invisible user is reported
  // exactly like an unknown login, so this form can't be used to find out who exists.
  const actor = await currentUserFromCookies();
  const canSeeTarget = targetUser ? (await userVisibilityFor(actor))(targetUser.id) : false;
  if (!targetUser || !canSeeTarget) {
    return { error: "指定されたログインIDのユーザーが見つかりません。" };
  }
  const givableIds = new Set(roles.map((role) => role.id));
  if (parsed.data.roleIds.some((roleId) => !givableIds.has(roleId))) {
    return { error: "存在しないロールが指定されました。" };
  }

  const memberRepository = new DrizzleMemberRepository();
  const alreadyMember = await memberRepository.findDirectByUserAndProject(targetUser.id, guard.project.id);
  if (alreadyMember) {
    return { error: "既にこのプロジェクトのメンバーです。" };
  }

  await memberRepository.create({
    userId: targetUser.id,
    groupId: null,
    inheritedFromMemberId: null,
    projectId: guard.project.id,
    roleIds: parsed.data.roleIds,
  });

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/members`);
  return { error: null };
}

const addGroupMemberSchema = z.object({
  projectIdentifier: z.string().min(1),
  groupId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()),
});

export async function addGroupMemberAction(_prevState: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const parsed = addGroupMemberSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    groupId: formData.get("groupId"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const guard = await requireManageMembers(parsed.data.projectIdentifier);
  if (!guard.project) {
    return { error: guard.error };
  }

  if (parsed.data.roleIds.length === 0) {
    return { error: "ロールを1つ以上選択してください。" };
  }

  const groupRepository = new DrizzleGroupRepository();
  const memberRepository = new DrizzleMemberRepository();
  const [group, roles, existingGroupMemberships] = await Promise.all([
    groupRepository.findById(parsed.data.groupId),
    // Role.givable, not findByIds: a crafted request must not be able to hand a member
    // the builtin Non member or Anonymous role.
    new DrizzleRoleRepository().listGivable(),
    memberRepository.listByGroup(parsed.data.groupId),
  ]);
  if (!group) {
    return { error: "指定されたグループが見つかりません。" };
  }
  const givableIds = new Set(roles.map((role) => role.id));
  if (parsed.data.roleIds.some((roleId) => !givableIds.has(roleId))) {
    return { error: "存在しないロールが指定されました。" };
  }
  if (existingGroupMemberships.some((m) => m.projectId === guard.project.id)) {
    return { error: "このグループは既にこのプロジェクトのメンバーです。" };
  }

  await addGroupToProject({ groupRepository, memberRepository }, { groupId: group.id, projectId: guard.project.id, roleIds: parsed.data.roleIds });

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/members`);
  return { error: null };
}

const updateMemberRolesSchema = z.object({
  projectIdentifier: z.string().min(1),
  memberId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()),
});

export async function updateMemberRolesAction(_prevState: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const parsed = updateMemberRolesSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    memberId: formData.get("memberId"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }
  // The membership's own project decides the actor's roles, not the identifier in the form.
  const memberRepository = new DrizzleMemberRepository();
  const member = await memberRepository.findById(parsed.data.memberId);
  if (!member) {
    return { error: "メンバーが見つかりません。" };
  }
  const { actor } = await resolveActor(user, member.projectId);

  try {
    await updateMemberRoles(
      {
        memberRepository,
        memberAdminRepository: memberRepository,
        projectRepository: new DrizzleProjectRepository(),
        roleRepository: new DrizzleRoleRepository(),
      },
      { memberId: parsed.data.memberId, roleIds: parsed.data.roleIds, actor },
    );
  } catch (error) {
    if (error instanceof UpdateMemberRolesNotPermittedError) {
      return { error: "この操作を行う権限がありません。" };
    }
    if (error instanceof MemberRolesEmptyError) {
      return { error: "ロールを1つ以上選択してください。" };
    }
    if (error instanceof MemberRolesInvalidError) {
      return { error: "存在しないロールが指定されました。" };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/members`);
  return { error: null };
}

const removeMemberSchema = z.object({
  projectIdentifier: z.string().min(1),
  memberId: z.string().uuid(),
});

export async function removeMemberAction(_prevState: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const parsed = removeMemberSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const guard = await requireManageMembers(parsed.data.projectIdentifier);
  if (!guard.project) {
    return { error: guard.error };
  }

  const memberRepository = new DrizzleMemberRepository();
  const members = await memberRepository.listByProject(guard.project.id);
  const target = members.find((m) => m.id === parsed.data.memberId);
  if (!target) {
    return { error: "メンバーが見つかりません。" };
  }

  await memberRepository.delete(target.id);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/members`);
  return { error: null };
}
