"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { updateGeneralSettings } from "@/application/settings/general-settings";
import { updateMailHandlerSettings } from "@/application/settings/mail-handler-settings";
import { parseKeywordList } from "@/domain/settings/commit-keywords";
import { ISSUE_DONE_RATIO_VALUES } from "@/domain/settings/general-settings";
import { PREFERRED_BODY_PART_VALUES } from "@/domain/settings/mail-handler-settings";
import { REMINDERS_JOB_TYPE, type RemindersJobPayload } from "@/application/jobs/send-reminders";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
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
  webhooksEnabled: z.coerce.boolean().default(false),
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
    webhooksEnabled: formData.get("webhooksEnabled") === "on",
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
    webhooksEnabled: parsed.data.webhooksEnabled,
  });

  revalidatePath("/admin/settings");
  return { error: null };
}

const updateMailHandlerSettingsSchema = z.object({
  apiEnabled: z.coerce.boolean().default(false),
  apiKey: z.string().max(255, "APIキーは255文字以内で入力してください。"),
  bodyDelimiters: z.string(),
  enableRegexDelimiters: z.coerce.boolean().default(false),
  excludedFilenames: z.string(),
  enableRegexExcludedFilenames: z.coerce.boolean().default(false),
  preferredBodyPart: z.enum(PREFERRED_BODY_PART_VALUES).default("plain"),
});

export async function updateMailHandlerSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateMailHandlerSettingsSchema.safeParse({
    apiEnabled: formData.get("apiEnabled") === "on",
    apiKey: formData.get("apiKey"),
    bodyDelimiters: formData.get("bodyDelimiters"),
    enableRegexDelimiters: formData.get("enableRegexDelimiters") === "on",
    excludedFilenames: formData.get("excludedFilenames"),
    enableRegexExcludedFilenames: formData.get("enableRegexExcludedFilenames") === "on",
    preferredBodyPart: formData.get("preferredBodyPart"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await updateMailHandlerSettings(new DrizzleSettingsRepository(), parsed.data);

  revalidatePath("/admin/settings");
  return { error: null };
}

export type RemindersActionState = { error: string | null; queued: boolean };

const enqueueRemindersSchema = z.object({
  days: z.coerce.number().int().positive("正の整数を入力してください。"),
});

/**
 * next-pm has no scheduler (docs/parity-checklist.md §15), so Redmine's
 * `rake redmine:send_reminders` — which an admin's cron runs — becomes a button that enqueues
 * the same work as a job. The worker does the sending, so a slow mail server can't hold the
 * request open, and an external scheduler can get the same effect by hitting this screen's
 * action or inserting the job row directly.
 */
export async function enqueueRemindersAction(
  _prevState: RemindersActionState,
  formData: FormData,
): Promise<RemindersActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError, queued: false };
  }

  const parsed = enqueueRemindersSchema.safeParse({ days: formData.get("days") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。", queued: false };
  }

  const payload: RemindersJobPayload = { days: parsed.data.days };
  await new DrizzleJobRepository().enqueue(REMINDERS_JOB_TYPE, payload);

  return { error: null, queued: true };
}
