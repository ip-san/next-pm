"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { updateGeneralSettings } from "@/application/settings/general-settings";
import { parseKeywordList } from "@/domain/settings/commit-keywords";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { requireAdmin } from "@/interface/http/require-admin";

export type SettingsActionState = {
  error: string | null;
};

const updateCommitKeywordSettingsSchema = z.object({
  refKeywords: z.string(),
  fixKeywords: z.string(),
  logtimeEnabled: z.coerce.boolean().default(false),
});

export async function updateCommitKeywordSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateCommitKeywordSettingsSchema.safeParse({
    refKeywords: formData.get("refKeywords"),
    fixKeywords: formData.get("fixKeywords"),
    logtimeEnabled: formData.get("logtimeEnabled") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await updateCommitKeywordSettings(new DrizzleSettingsRepository(), {
    refKeywords: parseKeywordList(parsed.data.refKeywords),
    fixKeywords: parseKeywordList(parsed.data.fixKeywords),
    logtimeEnabled: parsed.data.logtimeEnabled,
  });

  revalidatePath("/admin/settings");
  return { error: null };
}

const updateGeneralSettingsSchema = z.object({
  attachmentMaxSizeMb: z.coerce.number().positive("正の数を入力してください。"),
  restApiEnabled: z.coerce.boolean().default(false),
});

export async function updateGeneralSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateGeneralSettingsSchema.safeParse({
    attachmentMaxSizeMb: formData.get("attachmentMaxSizeMb"),
    restApiEnabled: formData.get("restApiEnabled") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await updateGeneralSettings(new DrizzleSettingsRepository(), {
    attachmentMaxSizeMb: parsed.data.attachmentMaxSizeMb,
    restApiEnabled: parsed.data.restApiEnabled,
  });

  revalidatePath("/admin/settings");
  return { error: null };
}
