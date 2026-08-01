import { mock } from "bun:test";
import type { Issue } from "./entity";
import type { IssueRepository } from "./repository";

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    projectId: "proj-1",
    trackerId: "tracker-1",
    statusId: "status-1",
    priorityId: "priority-1",
    subject: "Subject",
    description: "",
    authorId: "user-1",
    assignedToId: null,
    assignedToType: null,
    parentId: null,
    fixedVersionId: null,
    categoryId: null,
    isPrivate: false,
    doneRatio: 0,
    estimatedHours: null,
    startDate: null,
    dueDate: null,
    lockVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Every method defaults to a not-used throw or empty result; pass overrides for what a test actually exercises. */
export function makeIssueRepositoryMock(overrides: Partial<IssueRepository> = {}): IssueRepository {
  return {
    findById: mock(async () => null),
    listByProject: mock(async () => []),
    findByAssignee: mock(async () => []),
    findByAuthor: mock(async () => []),
    findByIds: mock(async () => []),
    search: mock(async () => []),
    existsOutsideProjectsWithFixedVersion: mock(async () => false),
    create: mock(async () => {
      throw new Error("not used");
    }),
    update: mock(async () => {
      throw new Error("not used");
    }),
    ...overrides,
  };
}
