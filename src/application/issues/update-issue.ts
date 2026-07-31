import { diffIssueChanges } from "@/domain/journal/diff-issue";
import type { JournalRepository } from "@/domain/journal/repository";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository, IssueUpdate } from "@/domain/issue/repository";
import { canTransitionTo } from "@/domain/workflow/transition-rules";
import type { WorkflowRepository } from "@/domain/workflow/repository";

export class WorkflowTransitionDeniedError extends Error {
  constructor(from: string, to: string) {
    super(`Transition from status ${from} to ${to} is not allowed for this role/tracker.`);
    this.name = "WorkflowTransitionDeniedError";
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

  const after = await repositories.issueRepository.update(
    input.issueId,
    input.expectedLockVersion,
    input.changes,
  );

  const details = diffIssueChanges(before, input.changes);
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
