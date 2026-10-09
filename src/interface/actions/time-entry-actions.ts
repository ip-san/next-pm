"use server";

import { submittedCustomValue } from "@/interface/http/custom-field-form-value";
import type { CustomFieldViewer } from "@/domain/custom-field/visibility";
import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import type { User } from "@/domain/user/entity";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { deleteTimeEntry } from "@/application/time-entries/delete-time-entry";
import { logTime, InvalidTimeEntryError } from "@/application/time-entries/log-time";
import {
  setTimeEntryCustomFieldValues,
  validateTimeEntryCustomFieldValues,
} from "@/application/time-entries/set-time-entry-custom-field-values";
import { updateTimeEntry } from "@/application/time-entries/update-time-entry";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import {
  canAccessTimeEntry,
  canAttachIssueToTimeEntry,
  canAttributeTimeEntryTo,
  type TimeEntryAccessContext,
} from "@/interface/http/time-entry-access";

export type LogTimeActionState = {
  error: string | null;
};

const NOT_FOUND = "工数が見つかりません。";
const ISSUE_NOT_FOUND = "チケットが見つかりません。";

function writeRepositories() {
  return {
    timeEntryRepository: new DrizzleTimeEntryRepository(),
    settingsRepository: new DrizzleSettingsRepository(),
    enumerationRepository: new DrizzleEnumerationRepository(),
    projectActivityRepository: new DrizzleProjectActivityRepository(),
  };
}

/** `cf_<uuid>` form inputs, same convention the issue forms use. */
function customFieldValuesFromForm(formData: FormData): Record<string, string> {
  const names = new Set([...formData.keys()].filter((key) => key.startsWith("cf_")));
  return Object.fromEntries([...names].map((name) => [name.slice(3), submittedCustomValue(formData.getAll(name))]));
}

function firstFieldError(error: CustomFieldValidationError): string {
  return Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの値を確認してください。";
}

/**
 * Runs before the entry is written, so an invalid value can't leave a created-but-wrong
 * entry behind that the user duplicates when they fix the value and resubmit.
 */
async function customFieldErrorIn(formData: FormData, options: { full: boolean }, viewer: CustomFieldViewer): Promise<string | null> {
  const fieldErrors = await validateTimeEntryCustomFieldValues(
    new DrizzleCustomFieldRepository(),
    customFieldValuesFromForm(formData),
    options,
viewer,
);
  return Object.values(fieldErrors)[0] ?? null;
}

async function saveCustomFieldValues(entryId: string, formData: FormData, viewer: CustomFieldViewer): Promise<void> {
  await setTimeEntryCustomFieldValues(
    { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
    entryId,
    customFieldValuesFromForm(formData),
viewer,
);
}

/**
 * Resolves the user a time entry is attributed to, through the shared
 * `canAttributeTimeEntryTo` rule. `authorId` is the entry's author (the actor's own id when
 * creating), because that is what Redmine compares the new value against.
 */
async function resolveTargetUserId(input: {
  requestedUserId: string | null;
  currentUser: User;
  authorId: string;
  currentUserIdOfEntry: string;
  projectId: string;
  canLogForOthers: boolean;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const requested = input.requestedUserId ?? input.currentUserIdOfEntry;
  const changed = requested !== input.currentUserIdOfEntry;

  const assignableUserIds =
    changed && requested !== input.authorId
      ? (
          await listAssignableTimeEntryUsers(
            {
              memberRepository: new DrizzleMemberRepository(),
              roleRepository: new DrizzleRoleRepository(),
              userRepository: new DrizzleUserRepository(),
            },
            input.projectId,
            input.currentUser,
          )
        ).map((candidate) => candidate.id)
      : [];

  const allowed = canAttributeTimeEntryTo({
    changed,
    requestedUserId: requested,
    authorId: input.authorId,
    assignableUserIds,
    canLogTimeForOtherUsers: input.canLogForOthers,
  });
  if (!allowed) {
    return { ok: false, error: "指定したユーザー名義で工数を記録する権限がありません。" };
  }
  return { ok: true, userId: requested };
}

/** Resolves and authorizes the issue a time entry is being attached to. */
async function resolveIssueId(
  issueId: string | null,
  projectId: string,
  context: Pick<TimeEntryAccessContext, "userId" | "actor" | "userGroupIds" | "projectContext">,
): Promise<{ ok: true; issueId: string | null } | { ok: false; error: string }> {
  if (issueId === null) {
    return { ok: true, issueId: null };
  }
  const issue = await new DrizzleIssueRepository().findById(issueId);
  if (!canAttachIssueToTimeEntry(issue, projectId, context)) {
    return { ok: false, error: ISSUE_NOT_FOUND };
  }
  return { ok: true, issueId };
}

const logTimeSchema = z.object({
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  activityId: z.string().uuid(),
  hours: z.coerce.number(),
  comments: z.string().default(""),
  spentOn: z.string().min(1),
  userId: z.string().uuid().nullable().default(null),
});

export async function logTimeAction(
  _prevState: LogTimeActionState,
  formData: FormData,
): Promise<LogTimeActionState> {
  const parsed = logTimeSchema.safeParse({
    issueId: formData.get("issueId"),
    projectIdentifier: formData.get("projectIdentifier"),
    activityId: formData.get("activityId"),
    hours: formData.get("hours"),
    comments: formData.get("comments") ?? "",
    spentOn: formData.get("spentOn"),
    userId: formData.get("userId") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const issue = await new DrizzleIssueRepository().findById(parsed.data.issueId);
  if (!issue) {
    return { error: ISSUE_NOT_FOUND };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
  // canAttachIssueToTimeEntry carries the log_time check as well as the visibility one.
  if (!canAttachIssueToTimeEntry(issue, project.id, { userId: user.id, actor, userGroupIds, projectContext })) {
    return { error: ISSUE_NOT_FOUND };
  }

  const target = await resolveTargetUserId({
    requestedUserId: parsed.data.userId,
    currentUser: user,
    authorId: user.id,
    currentUserIdOfEntry: user.id,
    projectId: project.id,
    canLogForOthers: can({ permission: "log_time_for_other_users", project: projectContext, actor }),
  });
  if (!target.ok) {
    return { error: target.error };
  }

  const customFieldError = await customFieldErrorIn(formData, { full: true }, customFieldViewerFor(user, roleIds));
  if (customFieldError) {
    return { error: customFieldError };
  }

  try {
    const entry = await logTime(writeRepositories(), {
      projectId: project.id,
      issueId: issue.id,
      userId: target.userId,
      authorId: user.id,
      activityId: parsed.data.activityId,
      hours: parsed.data.hours,
      comments: parsed.data.comments,
      spentOn: parsed.data.spentOn,
    });
    await saveCustomFieldValues(entry.id, formData, customFieldViewerFor(user, roleIds));
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return { error: error.message };
    }
    if (error instanceof CustomFieldValidationError) {
      return { error: firstFieldError(error) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${parsed.data.issueId}`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/time-entries`);
  return { error: null };
}

const createTimeEntrySchema = z.object({
  projectIdentifier: z.string().min(1),
  issueId: z.string().uuid().nullable().default(null),
  activityId: z.string().uuid(),
  hours: z.coerce.number(),
  comments: z.string().default(""),
  spentOn: z.string().min(1),
  userId: z.string().uuid().nullable().default(null),
});

/**
 * Project-level "log time" form (Redmine's `timelog/new` with no issue in the URL): the
 * issue is optional, and an entry without one is attributed to the project alone.
 */
export async function createTimeEntryAction(
  _prevState: LogTimeActionState,
  formData: FormData,
): Promise<LogTimeActionState> {
  const parsed = createTimeEntrySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    issueId: formData.get("issueId") || null,
    activityId: formData.get("activityId"),
    hours: formData.get("hours"),
    comments: formData.get("comments") ?? "",
    spentOn: formData.get("spentOn"),
    userId: formData.get("userId") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "log_time", project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  const issue = await resolveIssueId(parsed.data.issueId, project.id, { userId: user.id, actor, userGroupIds, projectContext });
  if (!issue.ok) {
    return { error: issue.error };
  }

  const target = await resolveTargetUserId({
    requestedUserId: parsed.data.userId,
    currentUser: user,
    authorId: user.id,
    currentUserIdOfEntry: user.id,
    projectId: project.id,
    canLogForOthers: can({ permission: "log_time_for_other_users", project: projectContext, actor }),
  });
  if (!target.ok) {
    return { error: target.error };
  }

  const customFieldError = await customFieldErrorIn(formData, { full: true }, customFieldViewerFor(user, roleIds));
  if (customFieldError) {
    return { error: customFieldError };
  }

  try {
    const entry = await logTime(writeRepositories(), {
      projectId: project.id,
      issueId: issue.issueId,
      userId: target.userId,
      authorId: user.id,
      activityId: parsed.data.activityId,
      hours: parsed.data.hours,
      comments: parsed.data.comments,
      spentOn: parsed.data.spentOn,
    });
    await saveCustomFieldValues(entry.id, formData, customFieldViewerFor(user, roleIds));
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return { error: error.message };
    }
    if (error instanceof CustomFieldValidationError) {
      return { error: firstFieldError(error) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/time-entries`);
  redirect(`/projects/${parsed.data.projectIdentifier}/time-entries`);
}

/**
 * Loads an entry and runs TimelogController's find_time_entry + check_editability chain.
 * The read half is `canAccessTimeEntry`, the same predicate the list, the report, the CSV
 * export and the REST endpoints use — an entry the actor couldn't have found in the list
 * (including one booked against a private issue they can't see) must not be reachable here
 * by id either, and it answers the same "not found" a nonexistent entry would.
 */
async function loadEditableEntry(projectIdentifier: string, entryId: string) {
  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false as const, error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    return { ok: false as const, error: "プロジェクトが見つかりません。" };
  }

  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const entry = await timeEntryRepository.findById(entryId);
  // The project comes from the entry, never from the form: a form naming a project the
  // actor has rights in can't be used to reach an entry that lives somewhere else.
  if (!entry || entry.projectId !== project.id) {
    return { ok: false as const, error: NOT_FOUND };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
  const issue = entry.issueId ? await new DrizzleIssueRepository().findById(entry.issueId) : null;
  const context: TimeEntryAccessContext = {
    userId: user.id,
    actor,
    userGroupIds,
    projectContext,
    issueById: new Map(issue ? [[issue.id, issue]] : []),
  };
  if (!canAccessTimeEntry(entry, context)) {
    return { ok: false as const, error: NOT_FOUND };
  }
  if (
    !canEditTimeEntry({
      entry,
      userId: user.id,
      visible: true,
      canEditTimeEntries: can({ permission: "edit_time_entries", project: projectContext, actor }),
      canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: projectContext, actor }),
    })
  ) {
    return { ok: false as const, error: "この操作を行う権限がありません。" };
  }

  return { ok: true as const, user, project, projectContext, actor, userGroupIds, roleIds, entry, timeEntryRepository };
}

const updateTimeEntrySchema = z.object({
  projectIdentifier: z.string().min(1),
  entryId: z.string().uuid(),
  issueId: z.string().uuid().nullable().default(null),
  activityId: z.string().uuid(),
  hours: z.coerce.number(),
  comments: z.string().default(""),
  spentOn: z.string().min(1),
  userId: z.string().uuid().nullable().default(null),
});

export async function updateTimeEntryAction(
  _prevState: LogTimeActionState,
  formData: FormData,
): Promise<LogTimeActionState> {
  const parsed = updateTimeEntrySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    entryId: formData.get("entryId"),
    issueId: formData.get("issueId") || null,
    activityId: formData.get("activityId"),
    hours: formData.get("hours"),
    comments: formData.get("comments") ?? "",
    spentOn: formData.get("spentOn"),
    userId: formData.get("userId") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const loaded = await loadEditableEntry(parsed.data.projectIdentifier, parsed.data.entryId);
  if (!loaded.ok) {
    return { error: loaded.error };
  }
  const accessContext = {
    userId: loaded.user.id,
    actor: loaded.actor,
    userGroupIds: loaded.userGroupIds,
    projectContext: loaded.projectContext,
  };

  // Re-authorized even though the entry is already editable: pointing an entry at a
  // different issue is the issue branch of safe_attributes=, not part of check_editability.
  const issue =
    parsed.data.issueId === loaded.entry.issueId
      ? { ok: true as const, issueId: loaded.entry.issueId }
      : await resolveIssueId(parsed.data.issueId, loaded.entry.projectId, accessContext);
  if (!issue.ok) {
    return { error: issue.error };
  }

  const target = await resolveTargetUserId({
    requestedUserId: parsed.data.userId,
    currentUser: loaded.user,
    authorId: loaded.entry.authorId,
    currentUserIdOfEntry: loaded.entry.userId,
    projectId: loaded.entry.projectId,
    canLogForOthers: can({ permission: "log_time_for_other_users", project: loaded.projectContext, actor: loaded.actor }),
  });
  if (!target.ok) {
    return { error: target.error };
  }

  const customFieldError = await customFieldErrorIn(formData, { full: false }, customFieldViewerFor(loaded.user, loaded.roleIds));
  if (customFieldError) {
    return { error: customFieldError };
  }

  try {
    await updateTimeEntry(
      { ...writeRepositories(), timeEntryRepository: loaded.timeEntryRepository, issueRepository: new DrizzleIssueRepository() },
      loaded.entry,
      {
        issueId: issue.issueId,
        userId: target.userId,
        activityId: parsed.data.activityId,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spentOn,
      },
    );
    await saveCustomFieldValues(loaded.entry.id, formData, customFieldViewerFor(loaded.user, loaded.roleIds));
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return { error: error.message };
    }
    if (error instanceof CustomFieldValidationError) {
      return { error: firstFieldError(error) };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/time-entries`);
  if (loaded.entry.issueId) {
    revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${loaded.entry.issueId}`);
  }
  redirect(`/projects/${parsed.data.projectIdentifier}/time-entries`);
}

export type DeleteTimeEntryActionState = {
  error: string | null;
};

const deleteTimeEntrySchema = z.object({
  projectIdentifier: z.string().min(1),
  entryId: z.string().uuid(),
});

export async function deleteTimeEntryAction(
  _prevState: DeleteTimeEntryActionState,
  formData: FormData,
): Promise<DeleteTimeEntryActionState> {
  const parsed = deleteTimeEntrySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  // Redmine routes destroy through the same editable_by? check as edit — there is no
  // separate delete_time_entries permission.
  const loaded = await loadEditableEntry(parsed.data.projectIdentifier, parsed.data.entryId);
  if (!loaded.ok) {
    return { error: loaded.error };
  }

  await deleteTimeEntry(
    { timeEntryRepository: loaded.timeEntryRepository, customValueRepository: new DrizzleCustomValueRepository() },
    loaded.entry.id,
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/time-entries`);
  if (loaded.entry.issueId) {
    revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${loaded.entry.issueId}`);
  }
  return { error: null };
}

export type BulkTimeEntryActionState = {
  error: string | null;
  message: string | null;
};

const bulkTimeEntrySchema = z.object({
  projectIdentifier: z.string().min(1),
  ids: z.array(z.string().uuid()).min(1, "工数を選択してください。"),
  activityId: z.string().uuid().nullable(),
  hours: z.number().positive("時間は0より大きい値を入力してください。").nullable(),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください。").nullable(),
  comments: z.string().nullable(),
});

/**
 * Redmine's TimelogController#bulk_update for the attributes that don't move an entry between
 * projects or issues. Every entry is checked the way the single-entry edit checks it (loadEditableEntry),
 * and a blank field leaves that attribute alone, as parse_params_for_bulk_update does. An entry that
 * can't be edited, or that the change makes invalid, is skipped and counted, so one bad entry doesn't
 * stop the rest.
 */
export async function bulkUpdateTimeEntriesAction(
  _prevState: BulkTimeEntryActionState,
  formData: FormData,
): Promise<BulkTimeEntryActionState> {
  const blank = (value: FormDataEntryValue | null) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);
  const hoursRaw = blank(formData.get("hours"));
  const parsed = bulkTimeEntrySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    ids: formData.getAll("ids"),
    activityId: blank(formData.get("activityId")),
    hours: hoursRaw === null ? null : Number(hoursRaw),
    spentOn: blank(formData.get("spentOn")),
    comments: typeof formData.get("comments") === "string" ? (formData.get("comments") as string) : null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。", message: null };
  }
  const { activityId, hours, spentOn, comments } = parsed.data;
  if (activityId === null && hours === null && spentOn === null && (comments === null || comments.trim().length === 0)) {
    return { error: "変更する項目を1つ以上入力してください。", message: null };
  }

  let saved = 0;
  let skipped = 0;
  for (const entryId of parsed.data.ids) {
    const loaded = await loadEditableEntry(parsed.data.projectIdentifier, entryId);
    if (!loaded.ok) {
      skipped += 1;
      continue;
    }
    try {
      await updateTimeEntry(
        { ...writeRepositories(), timeEntryRepository: loaded.timeEntryRepository, issueRepository: new DrizzleIssueRepository() },
        loaded.entry,
        {
          activityId: activityId ?? undefined,
          hours: hours ?? undefined,
          spentOn: spentOn ?? undefined,
          comments: comments && comments.trim().length > 0 ? comments : undefined,
        },
      );
      saved += 1;
    } catch (error) {
      if (error instanceof InvalidTimeEntryError) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/time-entries`);
  const message = skipped > 0 ? `${saved}件を更新しました。${skipped}件は更新できませんでした。` : `${saved}件を更新しました。`;
  return { error: saved === 0 ? "更新できる工数がありませんでした。" : null, message };
}
