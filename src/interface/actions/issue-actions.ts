"use server";

import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import { loadCustomFieldOptionSets } from "@/application/custom-field/option-sets";
import { customFieldOptionRepositories } from "@/interface/http/custom-field-option-repositories";
import { revalidatePath } from "next/cache";
import { can } from "@/domain/authorization/authorization-service";
import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { parseAssigneeValue } from "@/domain/issue/assignee";
import { StaleIssueError } from "@/domain/issue/entity";
import { wouldCreateParentCycle } from "@/domain/issue/parent";
import type { IssueUpdate } from "@/domain/issue/repository";
import { filterMembersVisibleToPrivateIssue, filterUserIdsVisibleToPrivateIssue, isPrivateIssueVisible } from "@/domain/issue/visibility";
import { memberUserIds } from "@/domain/member/entity";
import { createIssue } from "@/application/issues/create-issue";
import { resolveProjectActors } from "@/application/authorization/project-actors";
import { copyIssue, CopyIssueNotPermittedError } from "@/application/issues/copy-issue";
import { deleteIssue, DeleteIssueNotPermittedError, InvalidTimeEntryTargetError } from "@/application/issues/delete-issue";
import { moveIssue, MoveIssueNotPermittedError, ProjectHasNoTrackerError } from "@/application/issues/move-issue";
import { IssueAttributeNotAssignableError } from "@/application/issues/validate-issue-attributes";
import { CustomFieldValidationError } from "@/application/issues/set-custom-field-values";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { issueNotifyEvent } from "@/domain/notification/issue-tier";
import { issueMailSubject } from "@/domain/mail/subject";
import { triggerIssueWebhook } from "@/interface/http/webhook-trigger";
import {
  BlockedIssueCloseError,
  InvalidParentIssueError,
  updateIssue,
  WorkflowRequiredFieldError,
  WorkflowTransitionDeniedError,
} from "@/application/issues/update-issue";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { drizzleIssueAttributeRepositories } from "@/infrastructure/db/repositories/issue-attribute-repositories";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import {
  createIssueFormSchema,
  copyIssueFormSchema,
  deleteIssueFormSchema,
  moveIssueFormSchema,
  updateIssueFormSchema,
  type CopyIssueFormValues,
  type CreateIssueFormValues,
  type DeleteIssueFormValues,
  type UpdateIssueFormValues,
} from "./issue-schemas";

/** `{ ok: false }` carries `fieldErrors` keyed by custom field id when the custom values are what failed. */
const ISSUE_ATTRIBUTE_MESSAGES: Record<string, string> = {
  trackerId: "トラッカーが見つかりません。",
  priorityId: "優先度が見つかりません。",
  assignedToId: "担当者が見つかりません。",
  categoryId: "カテゴリが見つかりません。",
  fixedVersionId: "バージョンが見つかりません。",
};

function issueAttributeErrorMessage(error: IssueAttributeNotAssignableError): string {
  return ISSUE_ATTRIBUTE_MESSAGES[error.field] ?? "入力内容を確認してください。";
}

export type IssueFormActionResult =
  | { ok: true; issueId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createIssueFormAction(values: CreateIssueFormValues): Promise<IssueFormActionResult> {
  const parsed = createIssueFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findById(parsed.data.projectId);
  if (!project) {
    return { ok: false, error: "プロジェクトが見つかりません。" };
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "add_issues", project: projectContext, actor })) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  // Tracker, priority, assignee, category and version all belong to `createIssue` now
  // (application/issues/validate-issue-attributes.ts), so every entry point enforces the
  // same rules; only the parent's visibility stays here, since it needs the acting user.
  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const assignee = parseAssigneeValue(parsed.data.assignedToId);

  if (parsed.data.parentId) {
    const parentIssue = await new DrizzleIssueRepository().findById(parsed.data.parentId);
    if (
      !parentIssue ||
      parentIssue.projectId !== project.id ||
      !isPrivateIssueVisible(parentIssue, user.id, userGroupIds, issuesVisibilityRoles(actor))
    ) {
      return { ok: false, error: "親チケットが見つかりません。" };
    }
  }

  let estimatedHours: number | null = null;
  if (parsed.data.estimatedHours.trim().length > 0) {
    const parsedHours = Number(parsed.data.estimatedHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) {
      return { ok: false, error: "予定工数は0以上の数値で入力してください。" };
    }
    estimatedHours = parsedHours;
  }

  let doneRatio = 0;
  if (parsed.data.doneRatio.trim().length > 0) {
    const parsedRatio = Number(parsed.data.doneRatio);
    if (!Number.isInteger(parsedRatio) || parsedRatio < 0 || parsedRatio > 100) {
      return { ok: false, error: "進捗率は0〜100の整数で入力してください。" };
    }
    doneRatio = parsedRatio;
  }

  // Validated before the issue is created — never persist an issue whose custom values the
  // form is about to report as invalid. Create time wants full-set semantics (a required
  // field the form never submitted must still be caught), hence filling in "" for every
  // applicable field the submission didn't mention.
  const customFieldRepository = new DrizzleCustomFieldRepository();
  const applicableFields = visibleCustomFieldsFor(
    await customFieldRepository.listForTracker(parsed.data.trackerId),
    customFieldViewerFor(user, roleIds),
  );
  const optionSets = await loadCustomFieldOptionSets(customFieldOptionRepositories(), project.id, applicableFields);
  const { fieldErrors, coerced } = validateCustomFieldValues(
    applicableFields,
    Object.fromEntries(applicableFields.map((field) => [field.id, parsed.data.customFieldValues[field.id] ?? ""])),
    optionSets,
  );
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "カスタムフィールドの入力内容を確認してください。", fieldErrors };
  }

  let issue;
  try {
    issue = await createIssue(
      {
        ...drizzleIssueAttributeRepositories(),
        issueRepository: new DrizzleIssueRepository(),
        trackerRepository: new DrizzleTrackerRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
        userPreferencesRepository: new DrizzleUserPreferencesRepository(),
        watcherRepository: new DrizzleWatcherRepository(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        projectId: parsed.data.projectId,
        trackerId: parsed.data.trackerId,
        priorityId: parsed.data.priorityId,
        subject: parsed.data.subject,
        description: parsed.data.description,
        authorId: user.id,
        assignedToId: assignee?.id ?? null,
        assignedToType: assignee?.type ?? null,
        parentId: parsed.data.parentId || null,
        fixedVersionId: parsed.data.fixedVersionId || null,
        categoryId: parsed.data.categoryId || null,
        isPrivate: parsed.data.isPrivate,
        doneRatio,
        estimatedHours,
        startDate: parsed.data.startDate || null,
        dueDate: parsed.data.dueDate || null,
        actorRoleIds: roleIds,
        // On create the actor is the author, so the "own" variant always applies too.
        canSetPrivate:
          can({ permission: "set_issues_private", project: projectContext, actor }) ||
          can({ permission: "set_own_issues_private", project: projectContext, actor }),
        canManageSubtasks: can({ permission: "manage_subtasks", project: projectContext, actor }),
      },
    );
  } catch (error) {
    if (error instanceof WorkflowRequiredFieldError) {
      return { ok: false, error: "このステータスでは必須項目が未入力です。入力内容を確認してください。" };
    }
    if (error instanceof IssueAttributeNotAssignableError) {
      return { ok: false, error: issueAttributeErrorMessage(error) };
    }
    throw error;
  }

  const customValueRepository = new DrizzleCustomValueRepository();
  for (const { customFieldId, value } of coerced) {
    await customValueRepository.set(customFieldId, "Issue", issue.id, value);
  }

  const assigneeUserIds =
    issue.assignedToType === "group" && issue.assignedToId
      ? await new DrizzleGroupRepository().listUserIds(issue.assignedToId)
      : [issue.assignedToId];

  // Mirrors Issue#notified_users' `notified.reject! {|user| !visible?(user)}` — a private
  // issue must not be mailed to project members who can't see it. Author/assignees are
  // always visible to themselves, so only the "notify every member" group is filtered.
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [
      role.id,
      role,
    ]),
  );
  const notifiableMembers = filterMembersVisibleToPrivateIssue(issue, members, rolesById);

  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [[issue.authorId, ...assigneeUserIds], memberUserIds(notifiableMembers)],
      excludeUserId: user.id,
      subject: issueMailSubject(project.name, issue.id, issue.subject),
      body: issue.description,
      issueEvent: issueNotifyEvent(issue, null),
    },
  );
  await triggerIssueWebhook("issue.created", project, issue);

  return { ok: true, issueId: issue.id };
}


/**
 * The single-issue edit form's counterpart to Redmine's IssuesController#update — every
 * attribute `Issue#safe_attribute_names` exposes, plus notes and custom field values, in one
 * submission. Read-only enforcement, workflow transition checks, required-field checks and
 * the journal entry all live in `updateIssue`; this action's job is resolving the submitted
 * ids against the project (assignee, category, version, parent, tracker) and mapping failures
 * back to the form.
 *
 * Absent keys mean "untouched": a field the workflow marks read-only is never rendered, so
 * it must not be read as a blanked-out value.
 */
export async function updateIssueFormAction(values: UpdateIssueFormValues): Promise<IssueFormActionResult> {
  const parsed = updateIssueFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const issueRepository = new DrizzleIssueRepository();
  const existing = await issueRepository.findById(parsed.data.issueId);
  if (!existing) {
    return { ok: false, error: "チケットが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return { ok: false, error: "プロジェクトが見つかりません。" };
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(existing, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { ok: false, error: "チケットが見つかりません。" };
  }
  const isAuthor = existing.authorId === user.id;
  const isAssignee =
    existing.assignedToType === "group"
      ? existing.assignedToId !== null && userGroupIds.includes(existing.assignedToId)
      : existing.assignedToId === user.id;
  const projectContext = toAuthorizationProject(project);
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = isAuthor && can({ permission: "edit_own_issues", project: projectContext, actor });
  const canEditAttributes = canEditAny || canEditOwn;
  // Redmine's notes_addable? is its own permission: a user may comment without being able
  // to change anything about the issue.
  const canAddNotes = can({ permission: "add_issue_notes", project: projectContext, actor });
  const canSetNotesPrivate = can({ permission: "set_notes_private", project: projectContext, actor });
  if (!canEditAttributes && !canAddNotes) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const changes: IssueUpdate = {};

  if (parsed.data.trackerId !== undefined) changes.trackerId = parsed.data.trackerId;
  if (parsed.data.statusId !== undefined) changes.statusId = parsed.data.statusId;
  if (parsed.data.priorityId !== undefined) changes.priorityId = parsed.data.priorityId;
  if (parsed.data.subject !== undefined) changes.subject = parsed.data.subject;
  if (parsed.data.description !== undefined) changes.description = parsed.data.description;
  if (parsed.data.isPrivate !== undefined) changes.isPrivate = parsed.data.isPrivate;
  if (parsed.data.startDate !== undefined) changes.startDate = parsed.data.startDate || null;
  if (parsed.data.dueDate !== undefined) changes.dueDate = parsed.data.dueDate || null;

  // Assignee, category and version are validated by `updateIssue` against the project (and
  // only when they actually change, as Redmine's `_changed?`-guarded validations do), so
  // this action just maps the submitted strings onto the update.
  if (parsed.data.assignedToId !== undefined) {
    const assignee = parseAssigneeValue(parsed.data.assignedToId);
    changes.assignedToId = assignee?.id ?? null;
    changes.assignedToType = assignee?.type ?? null;
  }
  if (parsed.data.categoryId !== undefined) changes.categoryId = parsed.data.categoryId || null;
  if (parsed.data.fixedVersionId !== undefined) changes.fixedVersionId = parsed.data.fixedVersionId || null;

  if (parsed.data.parentId !== undefined && parsed.data.parentId !== (existing.parentId ?? "")) {
    if (parsed.data.parentId) {
      const projectIssues = await issueRepository.listByProject(project.id);
      const parentIssue = projectIssues.find((candidate) => candidate.id === parsed.data.parentId);
      if (!parentIssue || !isPrivateIssueVisible(parentIssue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
        return { ok: false, error: "親チケットが見つかりません。" };
      }
      // Mirrors Redmine's Issue#validate_parent_issue — an issue may not be re-parented
      // under itself or one of its own descendants.
      const parentIdById = new Map(projectIssues.map((candidate) => [candidate.id, candidate.parentId]));
      if (wouldCreateParentCycle(existing.id, parsed.data.parentId, parentIdById)) {
        return { ok: false, error: "自分自身または子孫のチケットを親に指定することはできません。" };
      }
    }
    changes.parentId = parsed.data.parentId || null;
  }

  if (parsed.data.estimatedHours !== undefined) {
    if (parsed.data.estimatedHours.trim().length === 0) {
      changes.estimatedHours = null;
    } else {
      const parsedHours = Number(parsed.data.estimatedHours);
      if (!Number.isFinite(parsedHours) || parsedHours < 0) {
        return { ok: false, error: "予定工数は0以上の数値で入力してください。" };
      }
      changes.estimatedHours = parsedHours;
    }
  }

  // A blank done ratio is "unchanged" rather than 0 — the column is NOT NULL, so there is no
  // cleared state to express. Like Redmine, the `issue_done_ratio` setting only hides the
  // field in the form; a submitted value stays honoured unless the target status overrides it.
  if (parsed.data.doneRatio !== undefined && parsed.data.doneRatio.trim().length > 0) {
    const parsedRatio = Number(parsed.data.doneRatio);
    if (!Number.isInteger(parsedRatio) || parsedRatio < 0 || parsedRatio > 100) {
      return { ok: false, error: "進捗率は0〜100の整数で入力してください。" };
    }
    changes.doneRatio = parsedRatio;
  }

  let outcome;
  try {
    outcome = await updateIssue(
      {
        ...drizzleIssueAttributeRepositories(),
        issueRepository,
        journalRepository: new DrizzleJournalRepository(),
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
        issueRelationRepository: new DrizzleIssueRelationRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
        userPreferencesRepository: new DrizzleUserPreferencesRepository(),
        watcherRepository: new DrizzleWatcherRepository(),
        customFieldRepository: new DrizzleCustomFieldRepository(),
        customValueRepository: new DrizzleCustomValueRepository(),
      },
      {
        issueId: parsed.data.issueId,
        expectedLockVersion: parsed.data.lockVersion,
        changes,
        customFieldValues: parsed.data.customFieldValues,
        notes: parsed.data.notes,
        actingUserId: user.id,
        actorRoleIds: roleIds,
        customFieldViewer: customFieldViewerFor(user, roleIds),
        isAuthor,
        isAssignee,
        // Mirrors Redmine: the broad permission, or the "own" one when the actor authored
        // the issue. Without either, a submitted is_private is dropped rather than refused.
        canSetPrivate:
          can({ permission: "set_issues_private", project: projectContext, actor }) ||
          (isAuthor && can({ permission: "set_own_issues_private", project: projectContext, actor })),
        canManageSubtasks: can({ permission: "manage_subtasks", project: projectContext, actor }),
        canEditAttributes,
        canAddNotes,
        privateNotes: parsed.data.privateNotes === true,
        canSetNotesPrivate,
      },
    );
  } catch (error) {
    if (error instanceof StaleIssueError) {
      return { ok: false, error: "他の変更と競合しました。ページを再読み込みして再度お試しください。" };
    }
    if (error instanceof WorkflowTransitionDeniedError) {
      return { ok: false, error: "そのステータスには変更できません。" };
    }
    if (error instanceof WorkflowRequiredFieldError) {
      return { ok: false, error: "このステータスでは必須項目が未入力のため変更できません。" };
    }
    if (error instanceof BlockedIssueCloseError) {
      return { ok: false, error: "このチケットは未完了の「ブロック」関連があるためクローズできません。" };
    }
    if (error instanceof IssueAttributeNotAssignableError) {
      return { ok: false, error: issueAttributeErrorMessage(error) };
    }
    if (error instanceof InvalidParentIssueError) {
      return {
        ok: false,
        error:
          error.reason === "cycle"
            ? "自分自身または子孫のチケットを親に指定することはできません。"
            : "親チケットが見つかりません。",
      };
    }
    if (error instanceof CustomFieldValidationError) {
      return { ok: false, error: "カスタムフィールドの入力内容を確認してください。", fieldErrors: error.fieldErrors };
    }
    throw error;
  }

  const updated = outcome.issue;
  // Everything below is built from what the update *stored*, never from the request body:
  // a note the actor wasn't allowed to add is dropped from the journal, and mailing it
  // anyway would deliver it to every recipient with no record anyone could audit.
  const noteBody = outcome.persistedNotes.trim();
  const noteIsPrivate = outcome.persistedNotesPrivate;

  // Mirrors Issue#notified_users for an update event: author, assignee(s), watchers, and
  // every project member (private-visibility filtered). Filtered against the *updated*
  // issue, since this form can flip is_private on — mailing the pre-update state would
  // leak an issue to members who just lost sight of it.
  const assigneeUserIds =
    updated.assignedToType === "group" && updated.assignedToId
      ? await new DrizzleGroupRepository().listUserIds(updated.assignedToId)
      : [updated.assignedToId];
  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [
      role.id,
      role,
    ]),
  );
  const notifiableMembers = filterMembersVisibleToPrivateIssue(updated, members, rolesById);
  const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("Issue", updated.id);
  // Watchers are their own recipient group, so the member filter above doesn't cover them:
  // someone can keep watching an issue this very request turned private. Mirrors Redmine's
  // notified_watchers, which rejects watchers the issue isn't visible to.
  const rolesByUserId = new Map(
    members.flatMap((member) =>
      member.userId === null
        ? []
        : [
            [
              member.userId,
              member.roleIds.flatMap((roleId) => {
                const role = rolesById.get(roleId);
                return role ? [role] : [];
              }),
            ] as const,
          ],
    ),
  );
  const notifiableWatcherUserIds = filterUserIdsVisibleToPrivateIssue(updated, watcherUserIds, rolesByUserId);

  const genericBody = "チケットが更新されました。";
  const recipientGroups = [[updated.authorId, ...assigneeUserIds], memberUserIds(notifiableMembers), notifiableWatcherUserIds];

  if (noteIsPrivate && noteBody.length > 0) {
    // Mirrors Journal#notified_users, which selects down to view_private_notes holders for
    // a private note. The note body goes only to them; everyone else who would have been
    // told about this update gets the generic message, so the change is still announced
    // without the note leaking — the same shape as Redmine's split into two journals.
    const candidates = [...new Set(recipientGroups.flat().flatMap((id) => (id ? [id] : [])))];
    const actors = await resolveProjectActors(drizzleIssueAttributeRepositories(), project.id, candidates);
    const permitted = candidates.filter((candidateId) => {
      const candidateActor = actors.get(candidateId);
      return candidateActor !== undefined && can({ permission: "view_private_notes", project: projectContext, actor: candidateActor });
    });
    const others = candidates.filter((candidateId) => !permitted.includes(candidateId));

    await enqueueNotification(
      { jobRepository: new DrizzleJobRepository() },
      { recipientGroups: [permitted], excludeUserId: user.id, issueEvent: issueNotifyEvent(updated, existing, notifiableWatcherUserIds), subject: `[${project.name}] ${updated.subject}`, body: noteBody },
    );
    if (others.length > 0) {
      await enqueueNotification(
        { jobRepository: new DrizzleJobRepository() },
        { recipientGroups: [others], excludeUserId: user.id, issueEvent: issueNotifyEvent(updated, existing, notifiableWatcherUserIds), subject: `[${project.name}] ${updated.subject}`, body: genericBody },
      );
    }
  } else {
    await enqueueNotification(
      { jobRepository: new DrizzleJobRepository() },
      {
        recipientGroups,
        excludeUserId: user.id,
        issueEvent: issueNotifyEvent(updated, existing, notifiableWatcherUserIds),
        subject: `[${project.name}] ${updated.subject}`,
        body: noteBody.length > 0 ? noteBody : genericBody,
      },
    );
  }
  await triggerIssueWebhook("issue.updated", project, updated);

  revalidatePath(`/projects/${project.identifier}/issues/${parsed.data.issueId}`);
  return { ok: true, issueId: parsed.data.issueId };
}

/**
 * Redmine's single-issue move (the `project_id` half of IssuesController#update, which
 * routes through `Issue#project=`). Requires edit rights on the issue *and* `add_issues` on
 * the destination, mirroring `Issue.allowed_target_projects`.
 */
export async function moveIssueAction(values: {
  issueId: string;
  targetProjectId: string;
  targetTrackerId: string;
}): Promise<{ ok: true; projectIdentifier: string } | { ok: false; error: string }> {
  const parsed = moveIssueFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const issueRepository = new DrizzleIssueRepository();
  const existing = await issueRepository.findById(parsed.data.issueId);
  if (!existing) {
    return { ok: false, error: "チケットが見つかりません。" };
  }

  const projectRepository = new DrizzleProjectRepository();
  const sourceProject = await projectRepository.findById(existing.projectId);
  if (!sourceProject) {
    return { ok: false, error: "プロジェクトが見つかりません。" };
  }

  const source = await resolveActor(user, sourceProject.id);
  if (!isPrivateIssueVisible(existing, user.id, source.userGroupIds, issuesVisibilityRoles(source.actor))) {
    return { ok: false, error: "チケットが見つかりません。" };
  }
  const sourceContext = toAuthorizationProject(sourceProject);
  const canEditAny = can({ permission: "edit_issues", project: sourceContext, actor: source.actor });
  const canEditOwn = existing.authorId === user.id && can({ permission: "edit_own_issues", project: sourceContext, actor: source.actor });
  if (!canEditAny && !canEditOwn) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const targetProject = await projectRepository.findById(parsed.data.targetProjectId);
  if (!targetProject) {
    return { ok: false, error: "移動先のプロジェクトが見つかりません。" };
  }
  const target = await resolveActor(user, targetProject.id);
  // Same "don't confirm it exists" posture the rest of this file takes: a project the actor
  // can't add issues to is reported as not found, not as forbidden.
  if (!can({ permission: "add_issues", project: toAuthorizationProject(targetProject), actor: target.actor })) {
    return { ok: false, error: "移動先のプロジェクトが見つかりません。" };
  }

  try {
    await moveIssue(
      {
        issueRepository,
        projectRepository,
        issueCategoryRepository: new DrizzleIssueCategoryRepository(),
        versionRepository: new DrizzleVersionRepository(),
        issueRelationRepository: new DrizzleIssueRelationRepository(),
        timeEntryRepository: new DrizzleTimeEntryRepository(),
        journalRepository: new DrizzleJournalRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        issueId: parsed.data.issueId,
        targetProjectId: parsed.data.targetProjectId,
        targetTrackerId: parsed.data.targetTrackerId || undefined,
        actingUserId: user.id,
        sourceActor: source.actor,
        targetActor: target.actor,
        isAuthor: existing.authorId === user.id,
        actorGroupIds: source.userGroupIds,
      },
    );
  } catch (error) {
    if (error instanceof StaleIssueError) {
      return { ok: false, error: "他の変更と競合しました。ページを再読み込みして再度お試しください。" };
    }
    if (error instanceof ProjectHasNoTrackerError) {
      return { ok: false, error: "移動先のプロジェクトにトラッカーが割り当てられていません。" };
    }
    // The checks above should have caught these; reaching here means the use case's own
    // re-derivation disagreed, so report it the same way rather than leaking the detail.
    if (error instanceof MoveIssueNotPermittedError) {
      return {
        ok: false,
        error: error.side === "source" ? "この操作を行う権限がありません。" : "移動先のプロジェクトが見つかりません。",
      };
    }
    throw error;
  }

  revalidatePath(`/projects/${sourceProject.identifier}/issues`);
  revalidatePath(`/projects/${targetProject.identifier}/issues/${parsed.data.issueId}`);
  return { ok: true, projectIdentifier: targetProject.identifier };
}

/**
 * Redmine's IssuesController#destroy. The issue goes with its whole subtask tree, and the
 * caller says what happens to the time logged against that set.
 */
export async function deleteIssueAction(
  values: DeleteIssueFormValues,
): Promise<{ ok: true; projectIdentifier: string } | { ok: false; error: string }> {
  const parsed = deleteIssueFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const issueRepository = new DrizzleIssueRepository();
  const existing = await issueRepository.findById(parsed.data.issueId);
  if (!existing) {
    return { ok: false, error: "チケットが見つかりません。" };
  }
  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return { ok: false, error: "プロジェクトが見つかりません。" };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(existing, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { ok: false, error: "チケットが見つかりません。" };
  }
  if (!can({ permission: "delete_issues", project: toAuthorizationProject(project), actor })) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  if (parsed.data.timeEntryMode === "reassign" && !parsed.data.reassignToIssueId) {
    return { ok: false, error: "工数の付け替え先チケットを選択してください。" };
  }

  try {
    await deleteIssue(
      {
        issueRepository,
        projectRepository: new DrizzleProjectRepository(),
        timeEntryRepository: new DrizzleTimeEntryRepository(),
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
        enumerationRepository: new DrizzleEnumerationRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        issueId: parsed.data.issueId,
        actingUserId: user.id,
        actor,
        actorGroupIds: userGroupIds,
        timeEntries:
          parsed.data.timeEntryMode === "reassign"
            ? { mode: "reassign", targetIssueId: parsed.data.reassignToIssueId }
            : { mode: parsed.data.timeEntryMode },
      },
    );
  } catch (error) {
    if (error instanceof DeleteIssueNotPermittedError) {
      return { ok: false, error: "この操作を行う権限がありません。" };
    }
    if (error instanceof InvalidTimeEntryTargetError) {
      return {
        ok: false,
        error:
          error.reason === "being_deleted"
            ? "削除対象のチケットに工数を付け替えることはできません。"
            : "付け替え先のチケットが見つかりません。",
      };
    }
    throw error;
  }

  revalidatePath(`/projects/${project.identifier}/issues`);
  return { ok: true, projectIdentifier: project.identifier };
}

/** Redmine's copy flow (IssuesController#new with `copy_from`), reduced to one submission. */
export async function copyIssueAction(
  values: CopyIssueFormValues,
): Promise<{ ok: true; issueId: string; projectIdentifier: string } | { ok: false; error: string }> {
  const parsed = copyIssueFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const issueRepository = new DrizzleIssueRepository();
  const existing = await issueRepository.findById(parsed.data.sourceIssueId);
  if (!existing) {
    return { ok: false, error: "チケットが見つかりません。" };
  }
  const projectRepository = new DrizzleProjectRepository();
  const sourceProject = await projectRepository.findById(existing.projectId);
  if (!sourceProject) {
    return { ok: false, error: "プロジェクトが見つかりません。" };
  }

  const source = await resolveActor(user, sourceProject.id);
  if (!isPrivateIssueVisible(existing, user.id, source.userGroupIds, issuesVisibilityRoles(source.actor))) {
    return { ok: false, error: "チケットが見つかりません。" };
  }
  if (!can({ permission: "copy_issues", project: toAuthorizationProject(sourceProject), actor: source.actor })) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const targetProject = await projectRepository.findById(parsed.data.targetProjectId);
  if (!targetProject) {
    return { ok: false, error: "コピー先のプロジェクトが見つかりません。" };
  }
  const target = await resolveActor(user, targetProject.id);
  const targetContext = toAuthorizationProject(targetProject);
  if (!can({ permission: "add_issues", project: targetContext, actor: target.actor })) {
    return { ok: false, error: "コピー先のプロジェクトが見つかりません。" };
  }

  let result;
  try {
    result = await copyIssue(
      {
        ...drizzleIssueAttributeRepositories(),
        issueRepository,
        projectRepository,
        trackerRepository: new DrizzleTrackerRepository(),
        issueCategoryRepository: new DrizzleIssueCategoryRepository(),
        versionRepository: new DrizzleVersionRepository(),
        issueRelationRepository: new DrizzleIssueRelationRepository(),
        customFieldRepository: new DrizzleCustomFieldRepository(),
        customValueRepository: new DrizzleCustomValueRepository(),
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
        userPreferencesRepository: new DrizzleUserPreferencesRepository(),
        watcherRepository: new DrizzleWatcherRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
      },
      {
        sourceIssueId: parsed.data.sourceIssueId,
        targetProjectId: parsed.data.targetProjectId,
        targetTrackerId: parsed.data.targetTrackerId || undefined,
        actingUserId: user.id,
        sourceActor: source.actor,
        targetActor: target.actor,
        actorGroupIds: source.userGroupIds,
        actorRoleIdsOnTarget: target.roleIds,
        customFieldViewerOnTarget: customFieldViewerFor(user, target.roleIds),
        copyAttachments: parsed.data.copyAttachments,
        copySubtasks: parsed.data.copySubtasks,
        // Mirrors the copy form's `@copy_watchers = User.current.allowed_to?(:add_issue_watchers, @project)`.
        copyWatchers:
          parsed.data.copyWatchers && can({ permission: "add_issue_watchers", project: targetContext, actor: target.actor }),
        canSetPrivate:
          can({ permission: "set_issues_private", project: targetContext, actor: target.actor }) ||
          can({ permission: "set_own_issues_private", project: targetContext, actor: target.actor }),
        canManageSubtasks: can({ permission: "manage_subtasks", project: targetContext, actor: target.actor }),
      },
    );
  } catch (error) {
    if (error instanceof CopyIssueNotPermittedError) {
      return {
        ok: false,
        error: error.side === "source" ? "この操作を行う権限がありません。" : "コピー先のプロジェクトが見つかりません。",
      };
    }
    if (error instanceof IssueAttributeNotAssignableError) {
      return { ok: false, error: issueAttributeErrorMessage(error) };
    }
    if (error instanceof WorkflowRequiredFieldError) {
      return { ok: false, error: "コピー先のワークフローで必須の項目が未入力のためコピーできません。" };
    }
    throw error;
  }

  revalidatePath(`/projects/${targetProject.identifier}/issues`);
  return { ok: true, issueId: result.issue.id, projectIdentifier: targetProject.identifier };
}
