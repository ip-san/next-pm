import { describe, expect, it, mock } from "bun:test";
import { createIssueRelation, InvalidRelationError, otherIssueId, relationLabelFor } from "./create-issue-relation";
import type { Issue } from "@/domain/issue/entity";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import type { SettingsRepository } from "@/domain/settings/repository";

function makeRepos(issuesById: Record<string, Issue>, existingRelations: IssueRelation[] = [], settings: Record<string, string> = {}) {
  const issueRepository = makeIssueRepositoryMock({
    findById: mock(async (id: string) => issuesById[id] ?? null),
  });
  const issueRelationRepository: IssueRelationRepository = {
    listForIssue: mock(async () => existingRelations),
    findById: mock(async () => null),
    create: mock(async (relation) => ({ ...relation, id: "relation-1" }) as IssueRelation),
    delete: mock(async () => {}),
  };
  const settingsRepository: SettingsRepository = {
    getAll: mock(async () => settings),
    setMany: mock(async () => {}),
  };
  return { issueRepository, issueRelationRepository, settingsRepository };
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

  it("rejects relating issues from different projects by default", async () => {
    const repos = makeRepos({
      "issue-a": makeIssue({ id: "issue-a", projectId: "proj-1" }),
      "issue-b": makeIssue({ id: "issue-b", projectId: "proj-2" }),
    });
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("allows relating issues from different projects when cross_project_issue_relations=1", async () => {
    const repos = makeRepos(
      { "issue-a": makeIssue({ id: "issue-a", projectId: "proj-1" }), "issue-b": makeIssue({ id: "issue-b", projectId: "proj-2" }) },
      [],
      { cross_project_issue_relations: "1" },
    );
    const relation = await createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null });
    expect(relation.relationType).toBe("relates");
  });

  it("rejects a duplicate relation between the same pair", async () => {
    const existing: IssueRelation = { id: "existing", issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null };
    const repos = makeRepos({ "issue-a": makeIssue({ id: "issue-a" }), "issue-b": makeIssue({ id: "issue-b" }) }, [existing]);
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("rejects relating a parent issue to its own subtask", async () => {
    const repos = makeRepos({
      "issue-a": makeIssue({ id: "issue-a", parentId: null }),
      "issue-b": makeIssue({ id: "issue-b", parentId: "issue-a" }),
    });
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("rejects relating a subtask to its own ancestor regardless of which side is passed as issue_to", async () => {
    const repos = makeRepos({
      "issue-a": makeIssue({ id: "issue-a", parentId: null }),
      "issue-b": makeIssue({ id: "issue-b", parentId: "issue-a" }),
    });
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-b", issueToId: "issue-a", relationType: "relates", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("allows relating two issues that are not in an ancestor/descendant relationship", async () => {
    const repos = makeRepos({
      "issue-a": makeIssue({ id: "issue-a", parentId: "issue-parent" }),
      "issue-b": makeIssue({ id: "issue-b", parentId: "issue-parent" }),
    });
    const relation = await createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null });
    expect(relation.relationType).toBe("relates");
  });

  it("rejects a 'blocks' relation that would close a cycle with an existing 'precedes' chain", async () => {
    // issue-a precedes issue-b (existing); relating issue-b blocks issue-a would let issue-a
    // reach itself via a -> b (precedes) -> a (blocks).
    const existing: IssueRelation = { id: "r1", issueFromId: "issue-a", issueToId: "issue-b", relationType: "precedes", delay: 0 };
    const repos = makeRepos(
      { "issue-a": makeIssue({ id: "issue-a" }), "issue-b": makeIssue({ id: "issue-b" }) },
      [existing],
    );
    await expect(
      createIssueRelation(repos, { issueFromId: "issue-b", issueToId: "issue-a", relationType: "blocks", delay: null }),
    ).rejects.toThrow(InvalidRelationError);
  });

  it("allows a non-circular 'precedes' relation extending an existing chain", async () => {
    const existing: IssueRelation = { id: "r1", issueFromId: "issue-a", issueToId: "issue-b", relationType: "precedes", delay: 0 };
    const repos = makeRepos(
      {
        "issue-a": makeIssue({ id: "issue-a" }),
        "issue-b": makeIssue({ id: "issue-b" }),
        "issue-c": makeIssue({ id: "issue-c" }),
      },
      [existing],
    );
    const relation = await createIssueRelation(repos, { issueFromId: "issue-b", issueToId: "issue-c", relationType: "precedes", delay: null });
    expect(relation.relationType).toBe("precedes");
  });

  it("does not apply the circular-dependency check to non-dependent relation types like 'relates'", async () => {
    // issue-b precedes issue-a exists; a "relates" between issue-a and issue-b would be
    // circular if the dependent-type check ran against it (it would reach back to
    // issue-a from issue-b via the existing precedes edge), but "relates" isn't a
    // dependent type, so the check must not apply and creation must succeed.
    const existing: IssueRelation = { id: "r1", issueFromId: "issue-b", issueToId: "issue-a", relationType: "precedes", delay: 0 };
    const repos = makeRepos(
      { "issue-a": makeIssue({ id: "issue-a" }), "issue-b": makeIssue({ id: "issue-b" }) },
      [existing],
    );
    const relation = await createIssueRelation(repos, { issueFromId: "issue-a", issueToId: "issue-b", relationType: "relates", delay: null });
    expect(relation.relationType).toBe("relates");
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
