import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { StaleIssueError } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import {
  BlockedIssueCloseError,
  InvalidParentIssueError,
  updateIssue,
  WorkflowRequiredFieldError,
  WorkflowTransitionDeniedError,
} from "@/application/issues/update-issue";
import {
  deleteIssue,
  DeleteIssueNotPermittedError,
  InvalidTimeEntryTargetError,
  type TimeEntryDisposition,
} from "@/application/issues/delete-issue";
import { CustomFieldValidationError } from "@/application/issues/set-custom-field-values";
import { IssueAttributeNotAssignableError } from "@/application/issues/validate-issue-attributes";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { drizzleIssueAttributeRepositories } from "@/infrastructure/db/repositories/issue-attribute-repositories";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
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
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

const ISSUE_ATTRIBUTE_ERROR_CODES: Record<string, string> = {
  trackerId: "invalid_tracker_id",
  priorityId: "invalid_priority_id",
  assignedToId: "invalid_assigned_to_id",
  categoryId: "invalid_category_id",
  fixedVersionId: "invalid_fixed_version",
};

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await new DrizzleIssueRepository().findById(id);
  if (!issue) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Mirrors Redmine raising RecordNotFound for an invisible issue rather than 403 —
  // doesn't confirm to an unauthorized caller that a given private issue id exists.
  if (!isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [journals, customValues] = await Promise.all([
    new DrizzleJournalRepository().listForIssue(id),
    new DrizzleCustomValueRepository().listForCustomized("Issue", id),
  ]);
  return NextResponse.json({ issue, journals, customValues });
}

const updateIssueSchema = z.object({
  lock_version: z.number().int(),
  notes: z.string().default(""),
  status_id: z.string().uuid().optional(),
  priority_id: z.string().uuid().optional(),
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  assigned_to_id: z.string().uuid().nullable().optional(),
  fixed_version_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  is_private: z.boolean().optional(),
  done_ratio: z.number().int().min(0).max(100).optional(),
  estimated_hours: z.number().nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  custom_field_values: z.record(z.string(), z.string()).default({}),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const existing = await new DrizzleIssueRepository().findById(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = updateIssueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  const isAuthor = existing.authorId === user.id;
  const isAssignee =
    existing.assignedToType === "group"
      ? existing.assignedToId !== null && userGroupIds.includes(existing.assignedToId)
      : existing.assignedToId === user.id;
  const projectContext = toAuthorizationProject(project);
  if (!isPrivateIssueVisible(existing, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = isAuthor && can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!canEditAny && !canEditOwn) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Tracker, priority, assignee, category and version are validated against the project by
  // updateIssue itself and reported through the catch below — previously this route checked
  // only that the assignee was *some* user and never looked at the category at all.
  try {
    const issue = await updateIssue(
      {
        ...drizzleIssueAttributeRepositories(),
        issueRepository: new DrizzleIssueRepository(),
        journalRepository: new DrizzleJournalRepository(),
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
        userPreferencesRepository: new DrizzleUserPreferencesRepository(),
        watcherRepository: new DrizzleWatcherRepository(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
        issueRelationRepository: new DrizzleIssueRelationRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
        customFieldRepository: new DrizzleCustomFieldRepository(),
        customValueRepository: new DrizzleCustomValueRepository(),
      },
      {
        issueId: id,
        expectedLockVersion: parsed.data.lock_version,
        notes: parsed.data.notes,
        customFieldValues: parsed.data.custom_field_values,
        actingUserId: user.id,
        actorRoleIds: roleIds,
        isAuthor,
        isAssignee,
        canSetPrivate:
          can({ permission: "set_issues_private", project: projectContext, actor }) ||
          (isAuthor && can({ permission: "set_own_issues_private", project: projectContext, actor })),
        canManageSubtasks: can({ permission: "manage_subtasks", project: projectContext, actor }),
        changes: {
          statusId: parsed.data.status_id,
          priorityId: parsed.data.priority_id,
          subject: parsed.data.subject,
          description: parsed.data.description,
          assignedToId: parsed.data.assigned_to_id,
          assignedToType: parsed.data.assigned_to_id === undefined ? undefined : parsed.data.assigned_to_id ? "user" : null,
          fixedVersionId: parsed.data.fixed_version_id,
          categoryId: parsed.data.category_id,
          isPrivate: parsed.data.is_private,
          doneRatio: parsed.data.done_ratio,
          estimatedHours: parsed.data.estimated_hours,
          startDate: parsed.data.start_date,
          dueDate: parsed.data.due_date,
        },
      },
    );

    return NextResponse.json({ issue });
  } catch (error) {
    if (error instanceof StaleIssueError) {
      return NextResponse.json({ error: "stale_issue" }, { status: 409 });
    }
    if (error instanceof WorkflowTransitionDeniedError) {
      return NextResponse.json({ error: "workflow_transition_denied" }, { status: 422 });
    }
    if (error instanceof WorkflowRequiredFieldError) {
      return NextResponse.json({ error: "workflow_required_field", field: error.fieldName }, { status: 422 });
    }
    if (error instanceof BlockedIssueCloseError) {
      return NextResponse.json({ error: "blocked_issue" }, { status: 422 });
    }
    if (error instanceof IssueAttributeNotAssignableError) {
      return NextResponse.json({ error: ISSUE_ATTRIBUTE_ERROR_CODES[error.field] ?? "invalid_request" }, { status: 422 });
    }
    if (error instanceof InvalidParentIssueError) {
      return NextResponse.json({ error: "invalid_parent_id", reason: error.reason }, { status: 422 });
    }
    // Raised before the issue row is written, so a rejected custom value no longer leaves a
    // partially applied update behind the way the previous save-then-validate order did.
    if (error instanceof CustomFieldValidationError) {
      return NextResponse.json({ error: "invalid_custom_field_values", details: error.fieldErrors }, { status: 422 });
    }
    throw error;
  }
}

/**
 * Mirrors Redmine's `DELETE /issues/:id.json`. The `todo` query parameter matches the
 * controller's: absent means destroy, which is also the model's `dependent: :destroy`.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const issueRepository = new DrizzleIssueRepository();
  const existing = await issueRepository.findById(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(existing, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!can({ permission: "delete_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const todo = new URL(request.url).searchParams.get("todo");
  const reassignTo = new URL(request.url).searchParams.get("reassign_to_id");
  const disposition: TimeEntryDisposition =
    todo === "nullify"
      ? { mode: "nullify" }
      : todo === "reassign"
        ? { mode: "reassign", targetIssueId: reassignTo ?? "" }
        : { mode: "destroy" };

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
      { issueId: id, actingUserId: user.id, actor, actorGroupIds: userGroupIds, timeEntries: disposition },
    );
  } catch (error) {
    if (error instanceof DeleteIssueNotPermittedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidTimeEntryTargetError) {
      return NextResponse.json({ error: "invalid_reassign_to_id", reason: error.reason }, { status: 422 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}

// Redmine's REST API accepts PUT for issue updates; next-pm's own handler is PATCH-shaped
// (partial update semantics), so alias PUT to it rather than requiring PATCH-aware clients.
export const PUT = PATCH;
