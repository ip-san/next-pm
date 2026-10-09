import { describe, expect, it, mock } from "bun:test";
import type { Issue } from "@/domain/issue/entity";
import { findIssuesByReference } from "./find-issues-by-reference";

const issue = { id: "eb0b2d1a-0000-4000-8000-000000000000", number: 42 } as Issue;

function repository(overrides: { byNumber?: Issue | null; byPrefix?: Issue[] } = {}) {
  return {
    findByNumber: mock(async () => overrides.byNumber ?? null),
    findByIdPrefix: mock(async () => overrides.byPrefix ?? []),
  };
}

describe("findIssuesByReference", () => {
  it("looks a number up by number", async () => {
    const repo = repository({ byNumber: issue });
    expect(await findIssuesByReference(repo, "42")).toEqual([issue]);
    expect(repo.findByNumber).toHaveBeenCalledWith(42);
    expect(repo.findByIdPrefix).not.toHaveBeenCalled();
  });

  it("returns nothing for a number that names no issue", async () => {
    expect(await findIssuesByReference(repository(), "999")).toEqual([]);
  });

  it("looks anything else up as an id prefix", async () => {
    const repo = repository({ byPrefix: [issue] });
    expect(await findIssuesByReference(repo, "eb0b2d1a")).toEqual([issue]);
    expect(repo.findByIdPrefix).toHaveBeenCalledWith("eb0b2d1a");
    expect(repo.findByNumber).not.toHaveBeenCalled();
  });

  it("doesn't read a leading zero as a number", async () => {
    const repo = repository({ byPrefix: [] });
    await findIssuesByReference(repo, "042");
    expect(repo.findByIdPrefix).toHaveBeenCalledWith("042");
  });
});
