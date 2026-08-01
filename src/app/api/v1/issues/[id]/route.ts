import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { StaleIssueError } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { updateIssue, WorkflowRequiredFieldError, WorkflowTransitionDeniedError } from "@/application/issues/update-issue";
import { CustomFieldValidationError, setIssueCustomFieldValues } from "@/application/issues/set-custom-field-values";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

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

  if (parsed.data.fixed_version_id) {
    // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
    // shared with (not just owned by) this issue's project, per its sharing setting.
    const sharedVersions = await new DrizzleVersionRepository().listSharedWith(project.id);
    if (!sharedVersions.some((version) => version.id === parsed.data.fixed_version_id)) {
      return NextResponse.json({ error: "invalid_fixed_version" }, { status: 422 });
    }
  }

  try {
    const issue = await updateIssue(
      {
        issueRepository: new DrizzleIssueRepository(),
        journalRepository: new DrizzleJournalRepository(),
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      {
        issueId: id,
        expectedLockVersion: parsed.data.lock_version,
        notes: parsed.data.notes,
        actingUserId: user.id,
        actorRoleIds: roleIds,
        isAuthor,
        isAssignee,
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

    if (Object.keys(parsed.data.custom_field_values).length > 0) {
      try {
        await setIssueCustomFieldValues(
          { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
          issue.trackerId,
          issue.id,
          parsed.data.custom_field_values,
        );
      } catch (customFieldError) {
        if (customFieldError instanceof CustomFieldValidationError) {
          return NextResponse.json(
            { issue, error: "invalid_custom_field_values", details: customFieldError.fieldErrors },
            { status: 422 },
          );
        }
        throw customFieldError;
      }
    }

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
    throw error;
  }
}
