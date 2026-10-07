import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import {
  actorIssuesVisibilityRoles,
  can,
  projectAuthorizationContext,
  type AuthorizationActor,
} from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { collectSelfAndDescendantIds } from "@/domain/issue/parent";
import type { IssueRepository } from "@/domain/issue/repository";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { ProjectRepository } from "@/domain/project/repository";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";

export class DeleteIssueNotPermittedError extends Error {
  constructor() {
    super("The acting user may not delete this issue.");
    this.name = "DeleteIssueNotPermittedError";
  }
}

export class InvalidTimeEntryTargetError extends Error {
  constructor(public readonly reason: "not_found" | "being_deleted") {
    super(`The issue chosen to receive the logged time is not usable (${reason}).`);
    this.name = "InvalidTimeEntryTargetError";
  }
}

/**
 * What to do with time logged against the issues being deleted, mirroring the `todo`
 * parameter of Redmine's IssuesController#destroy. Redmine's model-level default (and its
 * API's behaviour when no `todo` is given) is destroy — `has_many :time_entries,
 * dependent: :destroy` — so that is the default here too.
 */
export type TimeEntryDisposition =
  | { mode: "destroy" }
  | { mode: "nullify" }
  | { mode: "reassign"; targetIssueId: string };

export interface DeleteIssueRepositories {
  issueRepository: IssueRepository;
  projectRepository: ProjectRepository;
  timeEntryRepository: TimeEntryRepository;
  attachmentRepository: AttachmentRepository;
  attachmentStorage: AttachmentStorage;
}

export interface DeleteIssueInput {
  issueId: string;
  actingUserId: string;
  /** The acting user's resolved roles on the issue's project. */
  actor: AuthorizationActor;
  actorGroupIds?: string[];
  timeEntries?: TimeEntryDisposition;
}

export interface DeleteIssueResult {
  /** The issue plus every descendant that went with it. */
  deletedIssueIds: string[];
  /** Files whose rows are gone; removed from storage best-effort after the commit. */
  removedStorageKeys: string[];
}

/**
 * Port of Redmine's IssuesController#destroy together with `Issue#destroy`'s dependent
 * cleanup. An issue never goes alone: Redmine deletes it with all of its descendants
 * (`Issue.self_and_descendants`), and the time-entry question is asked about that whole set.
 */
export async function deleteIssue(
  repositories: DeleteIssueRepositories,
  input: DeleteIssueInput,
): Promise<DeleteIssueResult> {
  const issue = await repositories.issueRepository.findById(input.issueId);
  if (!issue) {
    throw new Error(`Issue ${input.issueId} not found`);
  }

  const project = await repositories.projectRepository.findById(issue.projectId);
  if (!project) {
    throw new Error(`Project ${issue.projectId} not found`);
  }
  // Mirrors Issue#deletable? — a single `delete_issues` permission, with no "own issues"
  // variant in Redmine. The project's archived/closed state and enabled modules are read
  // from the record loaded here rather than trusted from the caller.
  if (!can({ permission: "delete_issues", project: projectAuthorizationContext(project), actor: input.actor })) {
    throw new DeleteIssueNotPermittedError();
  }
  // Deleting a private issue the actor can't see would make the call an oracle for it.
  if (!isPrivateIssueVisible(issue, input.actingUserId, input.actorGroupIds ?? [], actorIssuesVisibilityRoles(input.actor))) {
    throw new DeleteIssueNotPermittedError();
  }

  const projectIssues = await repositories.issueRepository.listByProject(issue.projectId);
  const deletedIssueIds = collectSelfAndDescendantIds(
    issue.id,
    new Map(projectIssues.map((candidate) => [candidate.id, candidate.parentId])),
  );

  await disposeTimeEntries(repositories, deletedIssueIds, input.timeEntries ?? { mode: "destroy" }, issue);

  // Collected before the rows go, so the files can be removed once the delete has committed.
  const attachments = await repositories.attachmentRepository.listByContainers("Issue", deletedIssueIds);
  const removedStorageKeys = attachments.map((attachment) => attachment.storageKey);

  await repositories.issueRepository.deleteWithDependents(deletedIssueIds);

  // After the transaction: a file left behind is wasted disk, but a row pointing at a file
  // that is already gone would be a broken download, so this order is the safe one. Failures
  // are swallowed for the same reason Redmine tolerates a missing disk file on destroy.
  for (const storageKey of removedStorageKeys) {
    try {
      await repositories.attachmentStorage.delete(storageKey);
    } catch {
      continue;
    }
  }

  return { deletedIssueIds, removedStorageKeys };
}

async function disposeTimeEntries(
  repositories: DeleteIssueRepositories,
  deletedIssueIds: string[],
  disposition: TimeEntryDisposition,
  issue: Issue,
): Promise<void> {
  if (disposition.mode === "destroy") {
    await repositories.timeEntryRepository.deleteForIssues(deletedIssueIds);
    return;
  }
  if (disposition.mode === "nullify") {
    await repositories.timeEntryRepository.detachFromIssues(deletedIssueIds);
    return;
  }

  // Mirrors the `reassign` branch: the target must exist in the same project and must not be
  // one of the issues about to be deleted (Redmine's
  // error_cannot_reassign_time_entries_to_an_issue_about_to_be_deleted).
  if (deletedIssueIds.includes(disposition.targetIssueId)) {
    throw new InvalidTimeEntryTargetError("being_deleted");
  }
  const target = await repositories.issueRepository.findById(disposition.targetIssueId);
  if (!target || target.projectId !== issue.projectId) {
    throw new InvalidTimeEntryTargetError("not_found");
  }
  await repositories.timeEntryRepository.reassignToIssue(deletedIssueIds, target.id, target.projectId);
}
