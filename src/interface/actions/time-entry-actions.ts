"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { User } from "@/domain/user/entity";
import { canEditTimeEntry, isTimeEntryVisible } from "@/domain/time-entry/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { deleteTimeEntry } from "@/application/time-entries/delete-time-entry";
import { logTime, InvalidTimeEntryError } from "@/application/time-entries/log-time";
import { setTimeEntryCustomFieldValues } from "@/application/time-entries/set-time-entry-custom-field-values";
import { updateTimeEntry } from "@/application/time-entries/update-time-entry";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";

export type LogTimeActionState = {
  error: string | null;
};

/** `cf_<uuid>` form inputs, same convention the issue forms use. */
function customFieldValuesFromForm(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("cf_") && typeof value === "string") {
      values[key.slice(3)] = value;
    }
  }
  return values;
}

function firstFieldError(error: CustomFieldValidationError): string {
  return Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの値を確認してください。";
}

/**
 * Resolves the user the time is attributed to. Mirrors TimeEntry#safe_attributes= +
 * validate_time_entry: attributing to anyone but yourself needs `log_time_for_other_users`
 * AND the target has to be in `assignable_users` — holding the permission is not a licence
 * to log time against an arbitrary account.
 */
async function resolveTargetUserId(input: {
  requestedUserId: string | null;
  currentUser: User;
  projectId: string;
  canLogForOthers: boolean;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const requested = input.requestedUserId;
  if (!requested || requested === input.currentUser.id) {
    return { ok: true, userId: input.currentUser.id };
  }
  if (!input.canLogForOthers) {
    return { ok: false, error: "他のユーザー名義で工数を記録する権限がありません。" };
  }

  const assignable = await listAssignableTimeEntryUsers(
    {
      memberRepository: new DrizzleMemberRepository(),
      roleRepository: new DrizzleRoleRepository(),
      userRepository: new DrizzleUserRepository(),
    },
    input.projectId,
    input.currentUser,
  );
  if (!assignable.some((candidate) => candidate.id === requested)) {
    return { ok: false, error: "指定したユーザーはこのプロジェクトで工数を記録できません。" };
  }
  return { ok: true, userId: requested };
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
    return { error: "チケットが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "log_time", project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  const target = await resolveTargetUserId({
    requestedUserId: parsed.data.userId,
    currentUser: user,
    projectId: project.id,
    canLogForOthers: can({ permission: "log_time_for_other_users", project: projectContext, actor }),
  });
  if (!target.ok) {
    return { error: target.error };
  }

  try {
    const entry = await logTime(
      { timeEntryRepository: new DrizzleTimeEntryRepository(), settingsRepository: new DrizzleSettingsRepository() },
      {
        projectId: project.id,
        issueId: issue.id,
        userId: target.userId,
        authorId: user.id,
        activityId: parsed.data.activityId,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spentOn,
      },
    );
    await setTimeEntryCustomFieldValues(
      { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
      entry.id,
      customFieldValuesFromForm(formData),
    );
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
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "log_time", project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  // An issue typed into this form has to belong to the project being logged against, and
  // has to be one the actor can actually see — same rule as TimeEntry#validate_time_entry's
  // `errors.add :issue_id, :invalid if issue && project != issue.project` plus the
  // visibility branch of safe_attributes=.
  if (parsed.data.issueId) {
    const issue = await new DrizzleIssueRepository().findById(parsed.data.issueId);
    if (
      !issue ||
      issue.projectId !== project.id ||
      !isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))
    ) {
      return { error: "チケットが見つかりません。" };
    }
  }

  const target = await resolveTargetUserId({
    requestedUserId: parsed.data.userId,
    currentUser: user,
    projectId: project.id,
    canLogForOthers: can({ permission: "log_time_for_other_users", project: projectContext, actor }),
  });
  if (!target.ok) {
    return { error: target.error };
  }

  try {
    const entry = await logTime(
      { timeEntryRepository: new DrizzleTimeEntryRepository(), settingsRepository: new DrizzleSettingsRepository() },
      {
        projectId: project.id,
        issueId: parsed.data.issueId,
        userId: target.userId,
        authorId: user.id,
        activityId: parsed.data.activityId,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spentOn,
      },
    );
    await setTimeEntryCustomFieldValues(
      { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
      entry.id,
      customFieldValuesFromForm(formData),
    );
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
 * Returns the same "not found" for an entry the actor can't see as for one that doesn't
 * exist, so the list can't be probed for hidden entries by id.
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
  if (!entry || entry.projectId !== project.id) {
    return { ok: false as const, error: "工数が見つかりません。" };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor } = await resolveActor(user, project.id);
  const visible =
    can({ permission: "view_time_entries", project: projectContext, actor }) &&
    isTimeEntryVisible(entry, user.id, timeEntriesVisibilityRoles(actor));
  if (!visible) {
    return { ok: false as const, error: "工数が見つかりません。" };
  }
  if (
    !canEditTimeEntry({
      entry,
      userId: user.id,
      visible,
      canEditTimeEntries: can({ permission: "edit_time_entries", project: projectContext, actor }),
      canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: projectContext, actor }),
    })
  ) {
    return { ok: false as const, error: "この操作を行う権限がありません。" };
  }

  return { ok: true as const, user, project, projectContext, actor, entry, timeEntryRepository };
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

  const target = await resolveTargetUserId({
    requestedUserId: parsed.data.userId ?? loaded.entry.userId,
    currentUser: loaded.user,
    projectId: loaded.project.id,
    // Reassigning an entry that is already someone else's is only "logging for another
    // user" when the value actually changes — re-saving an entry you may edit but didn't
    // author must not demand the permission.
    canLogForOthers:
      (parsed.data.userId ?? loaded.entry.userId) === loaded.entry.userId ||
      can({ permission: "log_time_for_other_users", project: loaded.projectContext, actor: loaded.actor }),
  });
  if (!target.ok) {
    return { error: target.error };
  }

  try {
    await updateTimeEntry(
      {
        timeEntryRepository: loaded.timeEntryRepository,
        settingsRepository: new DrizzleSettingsRepository(),
        issueRepository: new DrizzleIssueRepository(),
      },
      loaded.entry,
      {
        issueId: parsed.data.issueId,
        userId: target.userId,
        activityId: parsed.data.activityId,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spentOn,
      },
    );
    await setTimeEntryCustomFieldValues(
      { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
      loaded.entry.id,
      customFieldValuesFromForm(formData),
    );
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
