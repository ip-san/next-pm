import { describe, expect, it, mock } from "bun:test";
import { createIssueRelation, InvalidRelationError, otherIssueId, relationLabelFor } from "./create-issue-relation";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";

function makeRepos(issuesById: Record<string, Issue>, existingRelations: IssueRelation[] = []) {
  const issueRepository = makeIssueRepositoryMock({
    findById: mock(async (id: string) => issuesById[id] ?? null),
  });
  const issueRelationRepository: IssueRelationRepository = {
    listForIssue: mock(async () => existingRelations),
    findById: mock(async () => null),
    create: mock(async (relation) => ({ ...relation, id: "relation-1" }) as IssueRelation),
    delete: mock(async () => {}),
  };
  return { issueRepository, issueRelationRepository };
}

describe("createIssueRelation", () => {
  it("creates a relation between two issues in the same project", async () => {
    const repos = makeRepos({ "issue-a": makeIssue({ id: "issue-a" }), "issue-b": makeIssue({ id: "issue-b" }) });
    const relation = await createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null });
    expect(relation.relationType).toBe("relates");
  });

  it("rejects relating an issue to itself", async () => {
    const repos = makeRepos({ "issue-a": makeIssue({ id: "issue-a" }) });
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-a", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("rejects a relation to a nonexistent issue", async () => {
    const repos = makeRepos({ "issue-a": makeIssue({ id: "issue-a" }) });
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "missing", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("rejects relating issues from different projects", async () => {
    const repos = makeRepos({
      "issue-a": makeIssue({ id: "issue-a", projectId: "proj-1" }),
      "issue-b": makeIssue({ id: "issue-b", projectId: "proj-2" }),
    });
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("rejects a duplicate relation between the same pair", async () => {
    const existing: IssueRelation = { id: "existing", issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null };
    const repos = makeRepos({ "issue-a": makeIssue({ id: "issue-a" }), "issue-b": makeIssue({ id: "issue-b" }) }, [existing]);
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });
});

describe("otherIssueId", () => {
  it("returns the to-side when queried from the from-side", () => {
    const relation: IssueRelation = { id: "r1", issueFromId: "a", issueToId: "b", relationType: "relates", delay: null };
    expect(otherIssueId(relation, "a")).toBe("b");
  });

  it("returns the from-side when queried from the to-side", () => {
    const relation: IssueRelation = { id: "r1", issueFromId: "a", issueToId: "b", relationType: "relates", delay: null };
    expect(otherIssueId(relation, "b")).toBe("a");
  });
});

describe("relationLabelFor", () => {
  it("returns the canonical type from the from-side", () => {
    const relation: IssueRelation = { id: "r1", issueFromId: "a", issueToId: "b", relationType: "blocks", delay: null };
    expect(relationLabelFor(relation, "a")).toBe("blocks");
  });

  it("returns the reverse label from the to-side", () => {
    const relation: IssueRelation = { id: "r1", issueFromId: "a", issueToId: "b", relationType: "blocks", delay: null };
    expect(relationLabelFor(relation, "b")).toBe("blocked");
  });
});
