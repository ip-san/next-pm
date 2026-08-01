import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { TrackerRepository } from "@/domain/tracker/repository";

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
}

export async function createIssue(
  repositories: { issueRepository: IssueRepository; trackerRepository: TrackerRepository },
  input: CreateIssueInput,
): Promise<Issue> {
  const tracker = await repositories.trackerRepository.findById(input.trackerId);
  if (!tracker) {
    throw new Error(`Tracker ${input.trackerId} not found`);
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
