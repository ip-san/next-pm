import { diffIssueChanges } from "@/domain/journal/diff-issue";
import type { JournalRepository } from "@/domain/journal/repository";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository, IssueUpdate } from "@/domain/issue/repository";
import { isFieldBlank } from "@/domain/workflow/blank";
import { readOnlyAttributeNames, requiredAttributeNames } from "@/domain/workflow/field-permission-rules";
import { canTransitionTo } from "@/domain/workflow/transition-rules";
import type { WorkflowEligibleField } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

export class WorkflowTransitionDeniedError extends Error {
  constructor(from: string, to: string) {
    super(`Transition from status ${from} to ${to} is not allowed for this role/tracker.`);
    this.name = "WorkflowTransitionDeniedError";
  }
}

export class WorkflowRequiredFieldError extends Error {
  constructor(public readonly fieldName: WorkflowEligibleField) {
    super(`Field "${fieldName}" is required in this status for this role and cannot be blank.`);
    this.name = "WorkflowRequiredFieldError";
  }
}

export interface UpdateIssueInput {
  issueId: string;
  expectedLockVersion: number;
  changes: IssueUpdate;
  notes: string;
  actingUserId: string;
  actorRoleIds: string[];
  isAuthor: boolean;
  isAssignee: boolean;
}

export async function updateIssue(
  repositories: {
    issueRepository: IssueRepository;
    journalRepository: JournalRepository;
    workflowRepository: WorkflowRepository;
    workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
  },
  input: UpdateIssueInput,
): Promise<Issue> {
  const before = await repositories.issueRepository.findById(input.issueId);
  if (!before) {
    throw new Error(`Issue ${input.issueId} not found`);
  }

  if (input.changes.statusId && input.changes.statusId !== before.statusId) {
    const transitions = await repositories.workflowRepository.listForTracker(before.trackerId);
    const allowed = canTransitionTo(
      transitions,
      {
        trackerId: before.trackerId,
        roleIds: input.actorRoleIds,
        currentStatusId: before.statusId,
        isAuthor: input.isAuthor,
        isAssignee: input.isAssignee,
      },
      input.changes.statusId,
    );
    if (!allowed) {
      throw new WorkflowTransitionDeniedError(before.statusId, input.changes.statusId);
    }
  }

  // Field permission rules are keyed by the status the issue will have *after* this update
  // (mirrors Redmine's Issue#safe_attributes=, which assigns status_id before computing
  // workflow_rule_by_attribute — see the doc comment on WorkflowFieldPermission).
  const fieldPermissionQuery = {
    trackerId: before.trackerId,
    statusId: input.changes.statusId ?? before.statusId,
    roleIds: input.actorRoleIds,
  };
  const fieldPermissions = await repositories.workflowFieldPermissionRepository.listForTracker(before.trackerId);

  const changes = { ...input.changes };
  for (const field of readOnlyAttributeNames(fieldPermissions, fieldPermissionQuery)) {
    delete changes[field];
  }

  // A field key can be present in `changes` with value `undefined` (every REST PATCH field is
  // optional, so the route always sends every key) — that means "not touched by this
  // request," not "clear it," so it must not shadow `before`'s real value in the merge
  // (mirrors diffIssueChanges's own undefined-means-omitted handling above).
  const merged: Record<string, unknown> = { ...before };
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const field of requiredAttributeNames(fieldPermissions, fieldPermissionQuery)) {
    if (isFieldBlank(merged[field])) {
      throw new WorkflowRequiredFieldError(field);
    }
  }

  const after = await repositories.issueRepository.update(input.issueId, input.expectedLockVersion, changes);

  const details = diffIssueChanges(before, changes);
  if (details.length > 0 || input.notes.trim().length > 0) {
    await repositories.journalRepository.create({
      journalizedType: "Issue",
      journalizedId: input.issueId,
      userId: input.actingUserId,
      notes: input.notes,
      details,
    });
  }

  return after;
}
