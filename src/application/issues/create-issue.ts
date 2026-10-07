import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { TrackerRepository } from "@/domain/tracker/repository";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";
import { isFieldBlank } from "@/domain/workflow/blank";
import type { WorkflowEligibleField } from "@/domain/workflow/entity";
import { requiredAttributeNames } from "@/domain/workflow/field-permission-rules";
import type { WorkflowFieldPermissionRepository } from "@/domain/workflow/repository";
import { applyAutoWatch } from "@/application/watchers/apply-auto-watch";
import { assertIssueAttributesAssignable, type IssueAttributeRepositories } from "./validate-issue-attributes";
import { WorkflowRequiredFieldError } from "./update-issue";

export interface CreateIssueInput {
  projectId: string;
  trackerId: string;
  priorityId: string;
  subject: string;
  description: string;
  authorId: string;
  assignedToId: string | null;
  assignedToType: "user" | "group" | null;
  parentId: string | null;
  fixedVersionId: string | null;
  categoryId: string | null;
  isPrivate: boolean;
  doneRatio: number;
  estimatedHours: number | null;
  startDate: string | null;
  dueDate: string | null;
  /** The author's roles on the project — feeds required-field enforcement (mirrors `roles_for_workflow`). */
  actorRoleIds: string[];
  /**
   * `set_issues_private`, or `set_own_issues_private` — on create the actor is always the
   * author, so the "own" variant always applies. False silently drops `isPrivate`, the way
   * Redmine's safe_attributes omits an attribute the actor may not set.
   */
  canSetPrivate: boolean;
  /** `manage_subtasks`; false silently drops `parentId`. */
  canManageSubtasks: boolean;
}

export async function createIssue(
  repositories: IssueAttributeRepositories & {
    issueRepository: IssueRepository;
    trackerRepository: TrackerRepository;
    workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
    userPreferencesRepository: UserPreferencesRepository;
    watcherRepository: WatcherRepository;
  },
  input: CreateIssueInput,
): Promise<Issue> {
  // Every id has to belong to this project — enforced here rather than per-caller so the
  // REST route, the CSV import and the mail handler can't each miss a different check.
  await assertIssueAttributesAssignable(repositories, {
    projectId: input.projectId,
    authorId: input.authorId,
    currentAssignee: null,
    candidate: {
      trackerId: input.trackerId,
      priorityId: input.priorityId,
      assignedTo: input.assignedToId && input.assignedToType ? { id: input.assignedToId, type: input.assignedToType } : null,
      categoryId: input.categoryId,
      fixedVersionId: input.fixedVersionId,
    },
  });

  // Redmine lists is_private and parent_issue_id in safe_attributes only when the actor
  // holds the matching permission, and silently discards them otherwise rather than
  // failing the save — same here.
  const isPrivate = input.canSetPrivate ? input.isPrivate : false;
  const parentId = input.canManageSubtasks ? input.parentId : null;

  const tracker = await repositories.trackerRepository.findById(input.trackerId);
  if (!tracker) {
    throw new Error(`Tracker ${input.trackerId} not found`);
  }

  // Read-only enforcement on create is deferred to a future cycle — every field is still
  // settable at creation time, only required-ness is checked here.
  const fieldPermissions = await repositories.workflowFieldPermissionRepository.listForTracker(input.trackerId);
  const required = requiredAttributeNames(fieldPermissions, {
    trackerId: input.trackerId,
    statusId: tracker.defaultStatusId,
    roleIds: input.actorRoleIds,
  });
  const candidate: Record<WorkflowEligibleField, unknown> = {
    subject: input.subject,
    description: input.description,
    assignedToId: input.assignedToId,
    priorityId: input.priorityId,
    categoryId: input.categoryId,
    fixedVersionId: input.fixedVersionId,
    startDate: input.startDate,
    dueDate: input.dueDate,
    doneRatio: input.doneRatio,
    estimatedHours: input.estimatedHours,
    isPrivate,
  };
  for (const field of required) {
    if (isFieldBlank(candidate[field])) {
      throw new WorkflowRequiredFieldError(field);
    }
  }

  const issue = await repositories.issueRepository.create({
    projectId: input.projectId,
    trackerId: input.trackerId,
    statusId: tracker.defaultStatusId,
    priorityId: input.priorityId,
    subject: input.subject,
    description: input.description,
    authorId: input.authorId,
    assignedToId: input.assignedToId,
    assignedToType: input.assignedToType,
    parentId,
    fixedVersionId: input.fixedVersionId,
    categoryId: input.categoryId,
    isPrivate,
    doneRatio: input.doneRatio,
    estimatedHours: input.estimatedHours,
    startDate: input.startDate,
    dueDate: input.dueDate,
  });

  await applyAutoWatch(repositories, "issue_created", "Issue", issue.id, issue.authorId);
  if (issue.assignedToId && issue.assignedToType === "user") {
    await applyAutoWatch(repositories, "issue_assigned_to_me", "Issue", issue.id, issue.assignedToId);
  }

  return issue;
}
