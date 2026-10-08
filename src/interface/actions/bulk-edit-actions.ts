"use server";

import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { parseAssigneeValue } from "@/domain/issue/assignee";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssueUpdate } from "@/domain/issue/repository";
import { BlockedIssueCloseError, updateIssue, WorkflowRequiredFieldError, WorkflowTransitionDeniedError } from "@/application/issues/update-issue";
import { CustomFieldValidationError } from "@/application/issues/set-custom-field-values";
import { IssueAttributeNotAssignableError } from "@/application/issues/validate-issue-attributes";
import { drizzleIssueAttributeRepositories } from "@/infrastructure/db/repositories/issue-attribute-repositories";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type BulkEditActionState = {
  error: string | null;
  message: string | null;
};

const bulkEditSchema = z.object({
  projectIdentifier: z.string().min(1),
  issueIds: z.array(z.string().uuid()).min(1),
  statusId: z.string().default(""),
  trackerId: z.string().default(""),
  priorityId: z.string().default(""),
  assignedToId: z.string().default(""),
  fixedVersionId: z.string().default(""),
  categoryId: z.string().default(""),
  startDate: z.string().default(""),
  dueDate: z.string().default(""),
  privateNotes: z.coerce.boolean().default(false),
  customFieldValues: z.record(z.string(), z.string()).default({}),
  doneRatio: z.string().default(""),
  notes: z.string().default(""),
});

export async function bulkUpdateIssuesAction(
  _prevState: BulkEditActionState,
  formData: FormData,
): Promise<BulkEditActionState> {
  const parsed = bulkEditSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    issueIds: formData.getAll("issueIds"),
    statusId: formData.get("statusId") ?? "",
    trackerId: formData.get("trackerId") ?? "",
    priorityId: formData.get("priorityId") ?? "",
    fixedVersionId: formData.get("fixedVersionId") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    startDate: formData.get("startDate") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    privateNotes: formData.get("privateNotes") === "on",
    customFieldValues: Object.fromEntries(
      [...formData.entries()].flatMap(([key, value]) =>
        key.startsWith("cf_") && typeof value === "string" && value.length > 0 ? [[key.slice(3), value]] : [],
      ),
    ),
    assignedToId: formData.get("assignedToId") ?? "",
    doneRatio: formData.get("doneRatio") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。", message: null };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", message: null };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。", message: null };
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!canEditAny && !canEditOwn) {
    return { error: "この操作を行う権限がありません。", message: null };
  }

  const changes: IssueUpdate = {};
  if (parsed.data.statusId) changes.statusId = parsed.data.statusId;
  if (parsed.data.trackerId) changes.trackerId = parsed.data.trackerId;
  if (parsed.data.priorityId) changes.priorityId = parsed.data.priorityId;
  // "__none__" clears, matching the assignee control; a blank value means "leave alone".
  if (parsed.data.fixedVersionId) {
    changes.fixedVersionId = parsed.data.fixedVersionId === "__none__" ? null : parsed.data.fixedVersionId;
  }
  if (parsed.data.assignedToId) {
    if (parsed.data.assignedToId === "__none__") {
      changes.assignedToId = null;
      changes.assignedToType = null;
    } else {
      const assignee = parseAssigneeValue(parsed.data.assignedToId);
      changes.assignedToId = assignee?.id ?? null;
      changes.assignedToType = assignee?.type ?? null;
    }
  }
  if (parsed.data.doneRatio.trim().length > 0) {
    const doneRatio = Number(parsed.data.doneRatio);
    if (!Number.isFinite(doneRatio) || doneRatio < 0 || doneRatio > 100) {
      return { error: "進捗率は0から100の数値で入力してください。", message: null };
    }
    changes.doneRatio = doneRatio;
  }
  // "__none__" clears, a blank value leaves the field alone — the convention the assignee
  // and version controls already use, and what Redmine's bulk edit means by its "none" option.
  if (parsed.data.categoryId) {
    changes.categoryId = parsed.data.categoryId === "__none__" ? null : parsed.data.categoryId;
  }
  if (parsed.data.startDate) {
    changes.startDate = parsed.data.startDate === "__none__" ? null : parsed.data.startDate;
  }
  if (parsed.data.dueDate) {
    changes.dueDate = parsed.data.dueDate === "__none__" ? null : parsed.data.dueDate;
  }

  const customFieldValues = parsed.data.customFieldValues;
  if (
    Object.keys(changes).length === 0 &&
    Object.keys(customFieldValues).length === 0 &&
    parsed.data.notes.trim().length === 0
  ) {
    return { error: "変更内容またはコメントを指定してください。", message: null };
  }

  const issueRepository = new DrizzleIssueRepository();
  const journalRepository = new DrizzleJournalRepository();
  const workflowRepository = new DrizzleWorkflowRepository();
  const workflowFieldPermissionRepository = new DrizzleWorkflowFieldPermissionRepository();
  const issueStatusRepository = new DrizzleIssueStatusRepository();
  const issueRelationRepository = new DrizzleIssueRelationRepository();
  const settingsRepository = new DrizzleSettingsRepository();
  const userPreferencesRepository = new DrizzleUserPreferencesRepository();
  const watcherRepository = new DrizzleWatcherRepository();
  const customFieldRepository = new DrizzleCustomFieldRepository();
  const customValueRepository = new DrizzleCustomValueRepository();
  const visibilityRoles = issuesVisibilityRoles(actor);
  const canAddNotes = can({ permission: "add_issue_notes", project: projectContext, actor });
  const canSetNotesPrivate = can({ permission: "set_notes_private", project: projectContext, actor });

  let updated = 0;
  let skipped = 0;
  for (const issueId of parsed.data.issueIds) {
    const issue = await issueRepository.findById(issueId);
    // Re-derive everything from the record itself rather than trusting the submitted id —
    // same IDOR-safe pattern as every other mutation in this app.
    if (
      !issue ||
      issue.projectId !== project.id ||
      !isPrivateIssueVisible(issue, user.id, userGroupIds, visibilityRoles) ||
      !(canEditAny || (canEditOwn && issue.authorId === user.id))
    ) {
      skipped++;
      continue;
    }

    try {
      await updateIssue(
        {
          ...drizzleIssueAttributeRepositories(),
          issueRepository,
          journalRepository,
          workflowRepository,
          workflowFieldPermissionRepository,
          issueStatusRepository,
          issueRelationRepository,
          settingsRepository,
          userPreferencesRepository,
          watcherRepository,
          customFieldRepository,
          customValueRepository,
        },
        {
          issueId: issue.id,
          expectedLockVersion: issue.lockVersion,
          changes,
          customFieldValues,
          notes: parsed.data.notes,
          actingUserId: user.id,
          actorRoleIds: roleIds,
          customFieldViewer: customFieldViewerFor(user, roleIds),
          // The same permission split the single-issue path applies. Without these a bulk
          // edit would let someone with edit_issues alone add notes, which add_issue_notes
          // is meant to gate.
          canEditAttributes: canEditAny || canEditOwn,
          canAddNotes,
          privateNotes: parsed.data.privateNotes,
          canSetNotesPrivate,
          isAuthor: issue.authorId === user.id,
          isAssignee:
            issue.assignedToType === "group"
              ? issue.assignedToId !== null && userGroupIds.includes(issue.assignedToId)
              : issue.assignedToId === user.id,
        },
      );
      updated++;
    } catch (error) {
      // A value that isn't assignable in one of the selected issues' projects is a
      // per-issue outcome in a bulk edit, not a reason to abort the whole batch.
      if (
        error instanceof WorkflowTransitionDeniedError ||
        error instanceof WorkflowRequiredFieldError ||
        error instanceof BlockedIssueCloseError ||
        error instanceof IssueAttributeNotAssignableError ||
        error instanceof CustomFieldValidationError
      ) {
        skipped++;
        continue;
      }
      throw error;
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues`);
  return {
    error: null,
    message: skipped > 0 ? `${updated}件更新しました（${skipped}件はスキップされました）。` : `${updated}件更新しました。`,
  };
}
