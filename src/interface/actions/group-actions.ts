"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addUserToGroup, removeUserFromGroup } from "@/application/groups/group-membership";
import { CustomFieldValidationError, setGroupCustomFieldValues } from "@/application/groups/set-group-custom-field-values";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { requireAdmin } from "@/interface/http/require-admin";

export type GroupActionState = {
  error: string | null;
};

const createGroupSchema = z.object({
  name: z.string().min(1).max(30),
});

export async function createGroupAction(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = createGroupSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await new DrizzleGroupRepository().create(parsed.data.name);

  revalidatePath("/admin/groups");
  return { error: null };
}

const deleteGroupSchema = z.object({
  groupId: z.string().uuid(),
});

export async function deleteGroupAction(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = deleteGroupSchema.safeParse({ groupId: formData.get("groupId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await new DrizzleGroupRepository().delete(parsed.data.groupId);

  revalidatePath("/admin/groups");
  return { error: null };
}

const addUserToGroupSchema = z.object({
  groupId: z.string().uuid(),
  login: z.string().min(1),
});

export async function addUserToGroupAction(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = addUserToGroupSchema.safeParse({ groupId: formData.get("groupId"), login: formData.get("login") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const groupRepository = new DrizzleGroupRepository();
  const [group, targetUser] = await Promise.all([groupRepository.findById(parsed.data.groupId), new DrizzleUserRepository().findByLogin(parsed.data.login)]);
  if (!group) {
    return { error: "指定されたグループが見つかりません。" };
  }
  if (!targetUser) {
    return { error: "指定されたログインIDのユーザーが見つかりません。" };
  }

  await addUserToGroup({ groupRepository, memberRepository: new DrizzleMemberRepository() }, group.id, targetUser.id);

  revalidatePath("/admin/groups");
  return { error: null };
}

const removeUserFromGroupSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function removeUserFromGroupAction(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = removeUserFromGroupSchema.safeParse({ groupId: formData.get("groupId"), userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await removeUserFromGroup({ groupRepository: new DrizzleGroupRepository(), memberRepository: new DrizzleMemberRepository() }, parsed.data.groupId, parsed.data.userId);

  revalidatePath("/admin/groups");
  return { error: null };
}

const updateGroupCustomFieldValuesSchema = z.object({
  groupId: z.string().uuid(),
  customFieldIds: z.array(z.string().uuid()).default([]),
});

/** Saves the Group custom field values from the group's page. Admin only, like the rest of group management. */
export async function updateGroupCustomFieldValuesAction(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateGroupCustomFieldValuesSchema.safeParse({
    groupId: formData.get("groupId"),
    customFieldIds: formData.getAll("customFieldIds"),
  });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。" };
  }

  const rawValues = Object.fromEntries(
    parsed.data.customFieldIds.map((fieldId) => [fieldId, (formData.get(`customField_${fieldId}`) ?? "").toString()]),
  );
  try {
    await setGroupCustomFieldValues(
      { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
      parsed.data.groupId,
      rawValues,
    );
  } catch (error) {
    if (error instanceof CustomFieldValidationError) {
      return { error: Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの入力内容を確認してください。" };
    }
    throw error;
  }

  revalidatePath(`/admin/groups/${parsed.data.groupId}`);
  return { error: null };
}
