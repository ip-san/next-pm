"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { updateGeneralSettings } from "@/application/settings/general-settings";
import { parseKeywordList } from "@/domain/settings/commit-keywords";
import { PARENT_ISSUE_ROLLUP_VALUES, ISSUE_DONE_RATIO_VALUES } from "@/domain/settings/general-settings";
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
  feedsLimit: z.coerce.number().int().positive("正の整数を入力してください。"),
  activityDaysDefault: z.coerce.number().int().positive("正の整数を入力してください。"),
  timelogAccept0Hours: z.coerce.boolean().default(false),
  repositoryLogDisplayLimit: z.coerce.number().int().positive("正の整数を入力してください。"),
  crossProjectIssueRelations: z.coerce.boolean().default(false),
  issueDoneRatio: z.enum(ISSUE_DONE_RATIO_VALUES).default("issue_field"),
  perPageOptions: z.string().default(""),
  issuesExportLimit: z.coerce.number().int().min(1),
  parentIssueDates: z.enum(PARENT_ISSUE_ROLLUP_VALUES).default("independent"),
  parentIssuePriority: z.enum(PARENT_ISSUE_ROLLUP_VALUES).default("independent"),
  parentIssueDoneRatio: z.enum(PARENT_ISSUE_ROLLUP_VALUES).default("independent"),
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
    feedsLimit: formData.get("feedsLimit"),
    activityDaysDefault: formData.get("activityDaysDefault"),
    timelogAccept0Hours: formData.get("timelogAccept0Hours") === "on",
    repositoryLogDisplayLimit: formData.get("repositoryLogDisplayLimit"),
    crossProjectIssueRelations: formData.get("crossProjectIssueRelations") === "on",
    issueDoneRatio: formData.get("issueDoneRatio"),
    perPageOptions: formData.get("perPageOptions"),
    issuesExportLimit: formData.get("issuesExportLimit"),
    parentIssueDates: formData.get("parentIssueDates"),
    parentIssuePriority: formData.get("parentIssuePriority"),
    parentIssueDoneRatio: formData.get("parentIssueDoneRatio"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await updateGeneralSettings(new DrizzleSettingsRepository(), {
    attachmentMaxSizeMb: parsed.data.attachmentMaxSizeMb,
    restApiEnabled: parsed.data.restApiEnabled,
    feedsLimit: parsed.data.feedsLimit,
    activityDaysDefault: parsed.data.activityDaysDefault,
    timelogAccept0Hours: parsed.data.timelogAccept0Hours,
    repositoryLogDisplayLimit: parsed.data.repositoryLogDisplayLimit,
    crossProjectIssueRelations: parsed.data.crossProjectIssueRelations,
    issueDoneRatio: parsed.data.issueDoneRatio,
    perPageOptions: parsed.data.perPageOptions,
    issuesExportLimit: parsed.data.issuesExportLimit,
    parentIssueDates: parsed.data.parentIssueDates,
    parentIssuePriority: parsed.data.parentIssuePriority,
    parentIssueDoneRatio: parsed.data.parentIssueDoneRatio,
  });

  revalidatePath("/admin/settings");
  return { error: null };
}
