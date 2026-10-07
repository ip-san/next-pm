"use server";

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
import { CustomFieldValidationError } from "@/application/issues/set-custom-field-values";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import {
  BlockedIssueCloseError,
  InvalidParentIssueError,
  updateIssue,
  WorkflowRequiredFieldError,
  WorkflowTransitionDeniedError,
} from "@/application/issues/update-issue";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
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
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import {
  createIssueFormSchema,
  updateIssueFormSchema,
  type CreateIssueFormValues,
  type UpdateIssueFormValues,
} from "./issue-schemas";

/** `{ ok: false }` carries `fieldErrors` keyed by custom field id when the custom values are what failed. */
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
  if (!can({ permission: "add_issues", project: toAuthorizationProject(project), actor })) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  if (!project.trackerIds.includes(parsed.data.trackerId)) {
    return { ok: false, error: "トラッカーが見つかりません。" };
  }

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const assignee = parseAssigneeValue(parsed.data.assignedToId);
  if (assignee) {
    const isValidAssignee =
      assignee.type === "user"
        ? members.some((member) => member.userId === assignee.id)
        : members.some((member) => member.groupId === assignee.id);
    if (!isValidAssignee) {
      return { ok: false, error: "担当者が見つかりません。" };
    }
  }

  if (parsed.data.categoryId) {
    const categories = await new DrizzleIssueCategoryRepository().listByProject(project.id);
    if (!categories.some((category) => category.id === parsed.data.categoryId)) {
      return { ok: false, error: "カテゴリが見つかりません。" };
    }
  }

  if (parsed.data.fixedVersionId) {
    // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
    // shared with (not just owned by) this issue's project, per its sharing setting.
    const sharedVersions = await new DrizzleVersionRepository().listSharedWith(project.id);
    if (!sharedVersions.some((version) => version.id === parsed.data.fixedVersionId)) {
      return { ok: false, error: "バージョンが見つかりません。" };
    }
  }

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
  const applicableFields = await customFieldRepository.listForTracker(parsed.data.trackerId);
  const { fieldErrors, coerced } = validateCustomFieldValues(
    applicableFields,
    Object.fromEntries(applicableFields.map((field) => [field.id, parsed.data.customFieldValues[field.id] ?? ""])),
  );
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "カスタムフィールドの入力内容を確認してください。", fieldErrors };
  }

  let issue;
  try {
    issue = await createIssue(
      {
        issueRepository: new DrizzleIssueRepository(),
        trackerRepository: new DrizzleTrackerRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
        userPreferencesRepository: new DrizzleUserPreferencesRepository(),
        watcherRepository: new DrizzleWatcherRepository(),
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
      },
    );
  } catch (error) {
    if (error instanceof WorkflowRequiredFieldError) {
      return { ok: false, error: "このステータスでは必須項目が未入力です。入力内容を確認してください。" };
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
      subject: `[${project.name}] ${issue.subject}`,
      body: issue.description,
    },
  );

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
  if (!canEditAny && !canEditOwn) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const changes: IssueUpdate = {};

  if (parsed.data.trackerId !== undefined) {
    if (!project.trackerIds.includes(parsed.data.trackerId)) {
      return { ok: false, error: "トラッカーが見つかりません。" };
    }
    changes.trackerId = parsed.data.trackerId;
  }
  if (parsed.data.statusId !== undefined) changes.statusId = parsed.data.statusId;
  if (parsed.data.priorityId !== undefined) changes.priorityId = parsed.data.priorityId;
  if (parsed.data.subject !== undefined) changes.subject = parsed.data.subject;
  if (parsed.data.description !== undefined) changes.description = parsed.data.description;
  if (parsed.data.isPrivate !== undefined) changes.isPrivate = parsed.data.isPrivate;
  if (parsed.data.startDate !== undefined) changes.startDate = parsed.data.startDate || null;
  if (parsed.data.dueDate !== undefined) changes.dueDate = parsed.data.dueDate || null;

  // Each lookup below only runs when the submitted value actually differs from what the
  // issue already holds — mirroring Redmine, whose validations are guarded by `_changed?`
  // (and whose `assignable_versions` keeps the current version even once it stops
  // qualifying). Re-checking an unchanged value would make an issue whose assignee left the
  // project, or whose version stopped being shared, impossible to edit at all.
  const currentAssigneeValue =
    existing.assignedToId === null ? "" : existing.assignedToType === "group" ? `group:${existing.assignedToId}` : existing.assignedToId;
  if (parsed.data.assignedToId !== undefined && parsed.data.assignedToId !== currentAssigneeValue) {
    const assignee = parseAssigneeValue(parsed.data.assignedToId);
    if (assignee) {
      const members = await new DrizzleMemberRepository().listByProject(project.id);
      const isValidAssignee =
        assignee.type === "user"
          ? members.some((member) => member.userId === assignee.id)
          : members.some((member) => member.groupId === assignee.id);
      if (!isValidAssignee) {
        return { ok: false, error: "担当者が見つかりません。" };
      }
    }
    changes.assignedToId = assignee?.id ?? null;
    changes.assignedToType = assignee?.type ?? null;
  }

  if (parsed.data.categoryId !== undefined && parsed.data.categoryId !== (existing.categoryId ?? "")) {
    if (parsed.data.categoryId) {
      const categories = await new DrizzleIssueCategoryRepository().listByProject(project.id);
      if (!categories.some((category) => category.id === parsed.data.categoryId)) {
        return { ok: false, error: "カテゴリが見つかりません。" };
      }
    }
    changes.categoryId = parsed.data.categoryId || null;
  }

  if (parsed.data.fixedVersionId !== undefined && parsed.data.fixedVersionId !== (existing.fixedVersionId ?? "")) {
    if (parsed.data.fixedVersionId) {
      // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
      // shared with (not just owned by) this issue's project, per its sharing setting.
      const sharedVersions = await new DrizzleVersionRepository().listSharedWith(project.id);
      if (!sharedVersions.some((version) => version.id === parsed.data.fixedVersionId)) {
        return { ok: false, error: "バージョンが見つかりません。" };
      }
    }
    changes.fixedVersionId = parsed.data.fixedVersionId || null;
  }

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

  let updated;
  try {
    updated = await updateIssue(
      {
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
        isAuthor,
        isAssignee,
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

  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [[updated.authorId, ...assigneeUserIds], memberUserIds(notifiableMembers), notifiableWatcherUserIds],
      excludeUserId: user.id,
      subject: `[${project.name}] ${updated.subject}`,
      body: parsed.data.notes.trim().length > 0 ? parsed.data.notes : "チケットが更新されました。",
    },
  );

  revalidatePath(`/projects/${project.identifier}/issues/${parsed.data.issueId}`);
  return { ok: true, issueId: parsed.data.issueId };
}
