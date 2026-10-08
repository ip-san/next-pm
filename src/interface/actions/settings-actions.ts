"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateAuthSettings } from "@/application/settings/auth-settings";
import { updateCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { updateGeneralSettings } from "@/application/settings/general-settings";
import { updateProjectDefaults } from "@/application/settings/project-defaults";
import { PROJECT_MODULES } from "@/domain/authorization/permission-registry";
import { PASSWORD_CHAR_CLASSES, SELF_REGISTRATION_MODES, TWOFA_MODES } from "@/domain/settings/auth-settings";
import { parseKeywordList } from "@/domain/settings/commit-keywords";
import { PARENT_ISSUE_ROLLUP_VALUES, ISSUE_DONE_RATIO_VALUES } from "@/domain/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { updateMailHandlerSettings } from "@/application/settings/mail-handler-settings";
import { PREFERRED_BODY_PART_VALUES } from "@/domain/settings/mail-handler-settings";
import { REMINDERS_JOB_TYPE, type RemindersJobPayload } from "@/application/jobs/send-reminders";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";

export type SettingsActionState = {
  error: string | null;
};

const updateCommitKeywordSettingsSchema = z.object({
  refKeywords: z.string(),
  fixKeywords: z.string(),
  logtimeEnabled: z.coerce.boolean().default(false),
  crossProjectRef: z.coerce.boolean().default(false),
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
    crossProjectRef: formData.get("crossProjectRef") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await updateCommitKeywordSettings(new DrizzleSettingsRepository(), {
    refKeywords: parseKeywordList(parsed.data.refKeywords),
    fixKeywords: parseKeywordList(parsed.data.fixKeywords),
    logtimeEnabled: parsed.data.logtimeEnabled,
    crossProjectRef: parsed.data.crossProjectRef,
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
  webhooksEnabled: z.coerce.boolean().default(false),
  displaySubprojectsIssues: z.coerce.boolean().default(false),
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
    webhooksEnabled: formData.get("webhooksEnabled") === "on",
    displaySubprojectsIssues: formData.get("displaySubprojectsIssues") === "on",
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
    webhooksEnabled: parsed.data.webhooksEnabled,
    displaySubprojectsIssues: parsed.data.displaySubprojectsIssues,
    perPageOptions: parsed.data.perPageOptions,
    issuesExportLimit: parsed.data.issuesExportLimit,
    parentIssueDates: parsed.data.parentIssueDates,
    parentIssuePriority: parsed.data.parentIssuePriority,
    parentIssueDoneRatio: parsed.data.parentIssueDoneRatio,
  });

  revalidatePath("/admin/settings");
  return { error: null };
}

const updateProjectDefaultsSchema = z.object({
  isPublic: z.coerce.boolean().default(false),
  enabledModules: z.array(z.enum(PROJECT_MODULES)).default([]),
  trackerIds: z.array(z.string().uuid()).default([]),
  sequentialIdentifiers: z.coerce.boolean().default(false),
  newProjectUserRoleId: z.string().uuid().nullable().default(null),
});

export async function updateProjectDefaultsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const roleIdRaw = formData.get("newProjectUserRoleId");
  const parsed = updateProjectDefaultsSchema.safeParse({
    isPublic: formData.get("isPublic") === "on",
    enabledModules: formData.getAll("enabledModules"),
    trackerIds: formData.getAll("trackerIds"),
    sequentialIdentifiers: formData.get("sequentialIdentifiers") === "on",
    newProjectUserRoleId: roleIdRaw ? roleIdRaw : null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  // Every tracker checked is stored as "unset", so the setting keeps following the tracker
  // list as trackers are added later — Redmine's unset default means "all trackers" too.
  const allTrackerIds = (await new DrizzleTrackerRepository().listAll()).map((tracker) => tracker.id);
  const everyTrackerChecked = allTrackerIds.length > 0 && allTrackerIds.every((id) => parsed.data.trackerIds.includes(id));

  await updateProjectDefaults(new DrizzleSettingsRepository(), {
    isPublic: parsed.data.isPublic,
    enabledModules: parsed.data.enabledModules,
    trackerIds: everyTrackerChecked ? null : parsed.data.trackerIds,
    sequentialIdentifiers: parsed.data.sequentialIdentifiers,
    newProjectUserRoleId: parsed.data.newProjectUserRoleId,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/projects/new");
  return { error: null };
}

const updateAuthSettingsSchema = z.object({
  loginRequired: z.coerce.boolean().default(false),
  autologinDays: z.coerce.number().int().min(0),
  selfRegistration: z.enum(SELF_REGISTRATION_MODES),
  passwordMinLength: z.coerce.number().int().positive("正の整数を入力してください。"),
  passwordRequiredCharClasses: z.array(z.enum(PASSWORD_CHAR_CLASSES)),
  lostPasswordEnabled: z.coerce.boolean().default(false),
  twofa: z.enum(TWOFA_MODES),
  unsubscribeEnabled: z.coerce.boolean().default(false),
  gravatarEnabled: z.coerce.boolean().default(false),
  sessionLifetimeMinutes: z.coerce.number().int().min(0),
  sessionTimeoutMinutes: z.coerce.number().int().min(0),
  maxAdditionalEmails: z.coerce.number().int().min(0),
});

/** Redmine's Administration > Settings > Authentication tab (SettingsController#edit, tab=authentication). */
export async function updateAuthSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const authError = await requireAdmin();
  if (authError) {
    return { error: authError };
  }

  const parsed = updateAuthSettingsSchema.safeParse({
    loginRequired: formData.get("loginRequired") === "on",
    autologinDays: formData.get("autologinDays"),
    selfRegistration: formData.get("selfRegistration"),
    passwordMinLength: formData.get("passwordMinLength"),
    passwordRequiredCharClasses: formData.getAll("passwordRequiredCharClasses"),
    lostPasswordEnabled: formData.get("lostPasswordEnabled") === "on",
    twofa: formData.get("twofa"),
    unsubscribeEnabled: formData.get("unsubscribeEnabled") === "on",
    gravatarEnabled: formData.get("gravatarEnabled") === "on",
    sessionLifetimeMinutes: formData.get("sessionLifetimeMinutes"),
    sessionTimeoutMinutes: formData.get("sessionTimeoutMinutes"),
    maxAdditionalEmails: formData.get("maxAdditionalEmails"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  await updateAuthSettings(new DrizzleSettingsRepository(), parsed.data);

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
