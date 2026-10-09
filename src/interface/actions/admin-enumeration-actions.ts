"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  deleteEnumeration,
  EnumerationNotDeletableError,
  EnumerationReassignmentRequiredError,
} from "@/application/enumerations/delete-enumeration";
import { nextPosition, resolveMove } from "@/domain/ordering/positioned";
import { enumerationTypeEnum } from "@/infrastructure/db/schema/enumerations";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { positionMoveValues, type AdminActionState } from "./admin-action-state";
import type { Enumeration } from "@/domain/enumeration/entity";
import { localizeError } from "@/interface/http/localize-error";

export type { AdminActionState } from "./admin-action-state";

/** The admin screen only edits system-wide rows; project overrides live on the project settings side. */
function isSystemRow(enumeration: Enumeration): boolean {
  return enumeration.projectId === null;
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
    return { error: await localizeError(authError) };
  }

  const parsed = createEnumerationSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const enumerationRepository = new DrizzleEnumerationRepository();
  if (parsed.data.isDefault) {
    await enumerationRepository.unsetSystemDefaultsForType(parsed.data.type);
  }
  // Positions are scoped per (type, project_id, parent_id) — Redmine's
  // `acts_as_positioned :scope => [:project_id, :parent_id]` on an STI subclass.
  const siblings = (await enumerationRepository.listByType(parsed.data.type)).filter(isSystemRow);
  await enumerationRepository.create({
    type: parsed.data.type,
    name: parsed.data.name,
    position: nextPosition(siblings),
    isDefault: parsed.data.isDefault,
    active: true,
    projectId: null,
    parentId: null,
  });

  revalidatePath("/admin/enumerations");
  return { error: null };
}

const enumerationIdSchema = z.object({ enumerationId: z.string().uuid() });

const updateEnumerationSchema = enumerationIdSchema.extend({
  name: z.string().min(1).max(30),
  isDefault: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(false),
});

export async function updateEnumerationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: await localizeError(authError) };
  }

  const parsed = updateEnumerationSchema.safeParse({
    enumerationId: formData.get("enumerationId"),
    name: formData.get("name"),
    isDefault: formData.get("isDefault") === "on",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  const repository = new DrizzleEnumerationRepository();
  const existing = await repository.findById(parsed.data.enumerationId);
  if (!existing || !isSystemRow(existing)) {
    return { error: await localizeError("項目が見つかりません。") };
  }

  // Enumeration#check_default clears the flag on every other row of the type before setting it.
  if (parsed.data.isDefault) {
    await repository.unsetSystemDefaultsForType(existing.type);
  }
  await repository.update(existing.id, { name: parsed.data.name, isDefault: parsed.data.isDefault, active: parsed.data.active });

  revalidatePath("/admin/enumerations");
  return { error: null };
}

const deleteEnumerationSchema = enumerationIdSchema.extend({
  reassignToId: z
    .string()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: "付け替え先の項目が不正です。",
    }),
});

export async function deleteEnumerationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: await localizeError(authError) };
  }

  const parsed = deleteEnumerationSchema.safeParse({
    enumerationId: formData.get("enumerationId"),
    reassignToId: formData.get("reassignToId"),
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。") };
  }

  try {
    await deleteEnumeration(
      { enumerationAdminRepository: new DrizzleEnumerationRepository() },
      parsed.data.enumerationId,
      parsed.data.reassignToId,
    );
  } catch (error) {
    if (error instanceof EnumerationReassignmentRequiredError || error instanceof EnumerationNotDeletableError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath("/admin/enumerations");
  return { error: null };
}

const reorderEnumerationSchema = enumerationIdSchema.extend({ move: z.enum(positionMoveValues) });

export async function reorderEnumerationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: await localizeError(authError) };
  }

  const parsed = reorderEnumerationSchema.safeParse({
    enumerationId: formData.get("enumerationId"),
    move: formData.get("move"),
  });
  if (!parsed.success) {
    return { error: await localizeError("並べ替えの指定が不正です。") };
  }

  const repository = new DrizzleEnumerationRepository();
  const target = await repository.findById(parsed.data.enumerationId);
  if (!target || !isSystemRow(target)) {
    return { error: await localizeError("項目が見つかりません。") };
  }

  const siblings = (await repository.listByType(target.type)).filter(isSystemRow);
  await repository.updatePositions(resolveMove(siblings, target.id, parsed.data.move));

  revalidatePath("/admin/enumerations");
  return { error: null };
}
