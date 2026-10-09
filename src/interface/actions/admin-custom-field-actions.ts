"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { coerceCustomFieldValue } from "@/domain/custom-field/coerce";
import { normalizeFieldVisibility } from "@/domain/custom-field/visibility";
import { nextPosition, resolveMove } from "@/domain/ordering/positioned";
import { customFieldFormatEnum, customizedTypeEnum } from "@/infrastructure/db/schema/custom-fields";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { positionMoveValues, type AdminActionState } from "./admin-action-state";
import type { CustomFieldFormat, CustomizedType } from "@/domain/custom-field/entity";

export type { AdminActionState } from "./admin-action-state";

const editableAttributesSchema = z.object({
  name: z.string().min(1).max(30),
  possibleValues: z.string().default(""),
  defaultValue: z.string().default(""),
  isRequired: z.coerce.boolean().default(false),
  multiple: z.coerce.boolean().default(false),
  trackerIds: z.array(z.string().uuid()).default([]),
  visible: z.coerce.boolean().default(true),
  roleIds: z.array(z.string().uuid()).default([]),
});

function editableAttributesFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    possibleValues: formData.get("possibleValues") ?? "",
    defaultValue: formData.get("defaultValue") ?? "",
    isRequired: formData.get("isRequired") === "on",
    multiple: formData.get("multiple") === "on",
    trackerIds: formData.getAll("trackerIds"),
    // Redmine's radio: "1" public, "0" restricted to the checked roles. Anything else is public.
    visible: formData.get("visible") !== "0",
    roleIds: formData.getAll("roleIds").filter((id) => id !== ""),
  };
}

type ResolvedAttributes = {
  multiple: boolean;
  name: string;
  isRequired: boolean;
  defaultValue: string | null;
  possibleValues: string[];
  trackerIds: string[];
  visible: boolean;
  roleIds: string[];
};

/**
 * The part of the form that is validated identically on create and on edit. `fieldFormat` and
 * `customizedType` are not here because they are fixed once the field exists — Redmine's
 * CustomField#field_format= ignores the assignment on a persisted record.
 */
async function resolveAttributes(
  attributes: z.infer<typeof editableAttributesSchema>,
  customizedType: CustomizedType,
  fieldFormat: CustomFieldFormat,
): Promise<{ ok: true; value: ResolvedAttributes } | { ok: false; error: string }> {
  // Only Issue custom fields have a tracker concept — Project and TimeEntry custom fields
  // apply to every project / every entry (mirrors Redmine's ProjectCustomField and
  // TimeEntryCustomField, neither of which has a custom_fields_trackers row).
  if (customizedType === "Issue" && attributes.trackerIds.length === 0) {
    return { ok: false, error: "対象トラッカーを1つ以上選択してください。" };
  }
  const trackerIds = customizedType === "Issue" ? attributes.trackerIds : [];

  // A user or version field takes one of its project's members or versions, which only an issue
  // has (see application/custom-field/option-sets.ts); a project or time entry has no such list.
  const pickedFromProject = fieldFormat === "user" || fieldFormat === "version" || fieldFormat === "enumeration";
  if (pickedFromProject && customizedType !== "Issue") {
    return { ok: false, error: "ユーザー・バージョン・列挙の形式はチケットのカスタムフィールドだけに指定できます。" };
  }
  if (pickedFromProject && attributes.defaultValue.trim().length > 0) {
    return { ok: false, error: "ユーザー・バージョン・列挙の形式には既定値を指定できません。" };
  }

  const trackers = await new DrizzleTrackerRepository().findByIds(trackerIds);
  if (trackers.length !== trackerIds.length) {
    return { ok: false, error: "存在しないトラッカーが指定されました。" };
  }

  // Visibility by role only exists for Issue, Project and TimeEntry fields (Redmine shows the selector for
  // exactly these), and a restricted field names roles an admin can give. Anything else is public.
  // Redmine's multiple_supported: the list, enumeration, user and version formats only.
  const multipleOffered = fieldFormat === "list" || fieldFormat === "enumeration" || fieldFormat === "user" || fieldFormat === "version";
  if (attributes.multiple && !multipleOffered) {
    return { ok: false, error: "複数の値は、リスト・列挙・ユーザー・バージョンの形式だけに指定できます。" };
  }
  const multiple = multipleOffered && attributes.multiple;

  const roleVisibilityOffered = customizedType === "Issue" || customizedType === "Project" || customizedType === "TimeEntry" || customizedType === "Version";
  const visibility = roleVisibilityOffered
    ? normalizeFieldVisibility({ visible: attributes.visible, roleIds: attributes.roleIds })
    : { visible: true, roleIds: [] };
  if (!visibility.visible) {
    const givable = new Set((await new DrizzleRoleRepository().listGivable()).map((role) => role.id));
    if (visibility.roleIds.some((id) => !givable.has(id))) {
      return { ok: false, error: "存在しないロールが指定されました。" };
    }
  }

  const possibleValues =
    fieldFormat === "list" || fieldFormat === "enumeration"
      ? attributes.possibleValues
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : [];
  if ((fieldFormat === "list" || fieldFormat === "enumeration") && possibleValues.length === 0) {
    return { ok: false, error: "リスト・列挙の形式には選択肢を1つ以上指定してください。" };
  }
  if (fieldFormat === "enumeration" && new Set(possibleValues).size !== possibleValues.length) {
    return { ok: false, error: "同じ選択肢を2つ以上指定できません。" };
  }

  let defaultValue: string | null = null;
  if (attributes.defaultValue.trim().length > 0) {
    const result = coerceCustomFieldValue(
      { name: attributes.name, fieldFormat, isRequired: false, possibleValues },
      attributes.defaultValue,
    );
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    defaultValue = result.value;
  }

  return {
    ok: true,
    value: {
      name: attributes.name,
      isRequired: attributes.isRequired,
      defaultValue,
      possibleValues,
      trackerIds,
      ...visibility,
      multiple,
    },
  };
}

const createCustomFieldSchema = editableAttributesSchema.extend({
  customizedType: z.enum(customizedTypeEnum),
  fieldFormat: z.enum(customFieldFormatEnum),
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
    ...editableAttributesFrom(formData),
    customizedType: formData.get("customizedType"),
    fieldFormat: formData.get("fieldFormat"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const resolved = await resolveAttributes(parsed.data, parsed.data.customizedType, parsed.data.fieldFormat);
  if (!resolved.ok) {
    return { error: resolved.error };
  }

  const repository = new DrizzleCustomFieldRepository();
  await repository.create({
    ...resolved.value,
    customizedType: parsed.data.customizedType,
    fieldFormat: parsed.data.fieldFormat,
    position: nextPosition(await repository.listAll()),
  });

  revalidatePath("/admin/custom-fields");
  return { error: null };
}

const customFieldIdSchema = z.object({ customFieldId: z.string().uuid() });

export async function updateCustomFieldAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = editableAttributesSchema
    .extend({ customFieldId: z.string().uuid() })
    .safeParse({ ...editableAttributesFrom(formData), customFieldId: formData.get("customFieldId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const repository = new DrizzleCustomFieldRepository();
  const existing = await repository.findById(parsed.data.customFieldId);
  if (!existing) {
    return { error: "カスタムフィールドが見つかりません。" };
  }

  const resolved = await resolveAttributes(parsed.data, existing.customizedType, existing.fieldFormat);
  if (!resolved.ok) {
    return { error: resolved.error };
  }
  await repository.update(existing.id, resolved.value);

  revalidatePath("/admin/custom-fields");
  return { error: null };
}

export async function deleteCustomFieldAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = customFieldIdSchema.safeParse({ customFieldId: formData.get("customFieldId") });
  if (!parsed.success) {
    return { error: "カスタムフィールドが見つかりません。" };
  }

  // Redmine's CustomFieldsController#destroy has no in-use guard: the field's custom_values are
  // declared `dependent: :delete_all` and go with it. The FK cascade reproduces that here.
  await new DrizzleCustomFieldRepository().delete(parsed.data.customFieldId);

  revalidatePath("/admin/custom-fields");
  return { error: null };
}

const reorderCustomFieldSchema = customFieldIdSchema.extend({ move: z.enum(positionMoveValues) });

export async function reorderCustomFieldAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = reorderCustomFieldSchema.safeParse({
    customFieldId: formData.get("customFieldId"),
    move: formData.get("move"),
  });
  if (!parsed.success) {
    return { error: "並べ替えの指定が不正です。" };
  }

  // Redmine declares a bare `acts_as_positioned` on CustomField, so the position runs across
  // the whole STI table rather than per subclass — Issue and Project fields share one order.
  const repository = new DrizzleCustomFieldRepository();
  await repository.updatePositions(
    resolveMove(await repository.listAll(), parsed.data.customFieldId, parsed.data.move),
  );

  revalidatePath("/admin/custom-fields");
  return { error: null };
}
