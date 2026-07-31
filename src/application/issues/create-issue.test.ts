import { describe, expect, it, mock } from "bun:test";
import { createIssue } from "./create-issue";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { Tracker } from "@/domain/tracker/entity";
import type { TrackerRepository } from "@/domain/tracker/repository";

describe("createIssue", () => {
  it("defaults the status to the tracker's default status", async () => {
    const tracker: Tracker = { id: "tracker-1", name: "Bug", defaultStatusId: "new", position: 1, isInRoadmap: true };
    const trackerRepository: TrackerRepository = {
      findById: mock(async () => tracker),
      findByIds: mock(async () => [tracker]),
      listAll: mock(async () => [tracker]),
      create: mock(async () => tracker),
    };
    const issueRepository: IssueRepository = {
      findById: mock(async () => null),
      listByProject: mock(async () => []),
      search: mock(async () => []),
      create: mock(async (issue) => ({ ...issue, id: "issue-1", lockVersion: 0, createdAt: new Date(), updatedAt: new Date() }) as Issue),
      update: mock(async () => {
        throw new Error("not used");
      }),
    };

    const issue = await createIssue(
      { issueRepository, trackerRepository },
      {
        projectId: "proj-1",
        trackerId: "tracker-1",
        priorityId: "normal",
        subject: "New bug",
        description: "",
        authorId: "user-1",
        assignedToId: null,
        parentId: null,
        categoryId: null,
        isPrivate: false,
        estimatedHours: null,
        startDate: null,
        dueDate: null,
      },
    );

    expect(issue.statusId).toBe("new");
    expect(issue.doneRatio).toBe(0);
  });

  it("throws when the tracker does not exist", async () => {
    const trackerRepository: TrackerRepository = {
      findById: mock(async () => null),
      findByIds: mock(async () => []),
      listAll: mock(async () => []),
      create: mock(async () => {
        throw new Error("not used");
      }),
    };
    const issueRepository: IssueRepository = {
      findById: mock(async () => null),
      listByProject: mock(async () => []),
      search: mock(async () => []),
      create: mock(async () => {
        throw new Error("not used");
      }),
      update: mock(async () => {
        throw new Error("not used");
      }),
    };

    await expect(
      createIssue(
        { issueRepository, trackerRepository },
        {
          projectId: "proj-1",
          trackerId: "missing",
          priorityId: "normal",
          subject: "x",
          description: "",
          authorId: "user-1",
          assignedToId: null,
          parentId: null,
          categoryId: null,
          isPrivate: false,
          estimatedHours: null,
          startDate: null,
          dueDate: null,
        },
      ),
    ).rejects.toThrow(/not found/);
  });
});
