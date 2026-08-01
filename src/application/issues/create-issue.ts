import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { TrackerRepository } from "@/domain/tracker/repository";
import { isFieldBlank } from "@/domain/workflow/blank";
import type { WorkflowEligibleField } from "@/domain/workflow/entity";
import { requiredAttributeNames } from "@/domain/workflow/field-permission-rules";
import type { WorkflowFieldPermissionRepository } from "@/domain/workflow/repository";
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
  estimatedHours: number | null;
  startDate: string | null;
  dueDate: string | null;
  /** The author's roles on the project — feeds required-field enforcement (mirrors `roles_for_workflow`). */
  actorRoleIds: string[];
}

export async function createIssue(
  repositories: {
    issueRepository: IssueRepository;
    trackerRepository: TrackerRepository;
    workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
  },
  input: CreateIssueInput,
): Promise<Issue> {
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
    doneRatio: 0,
    estimatedHours: input.estimatedHours,
    isPrivate: input.isPrivate,
  };
  for (const field of required) {
    if (isFieldBlank(candidate[field])) {
      throw new WorkflowRequiredFieldError(field);
    }
  }

  return repositories.issueRepository.create({
    projectId: input.projectId,
    trackerId: input.trackerId,
    statusId: tracker.defaultStatusId,
    priorityId: input.priorityId,
    subject: input.subject,
    description: input.description,
    authorId: input.authorId,
    assignedToId: input.assignedToId,
    assignedToType: input.assignedToType,
    parentId: input.parentId,
    fixedVersionId: input.fixedVersionId,
    categoryId: input.categoryId,
    isPrivate: input.isPrivate,
    doneRatio: 0,
    estimatedHours: input.estimatedHours,
    startDate: input.startDate,
    dueDate: input.dueDate,
  });
}
