import { describe, expect, it } from "bun:test";
import { allowedNewStatusIds, canTransitionTo } from "./transition-rules";
import type { WorkflowTransition } from "./entity";

function transition(overrides: Partial<WorkflowTransition>): WorkflowTransition {
  return {
    id: "t",
    trackerId: "tracker-1",
    roleId: "role-1",
    oldStatusId: "new",
    newStatusId: "in-progress",
    author: false,
    assignee: false,
    ...overrides,
  };
}

const baseQuery = {
  trackerId: "tracker-1",
  roleIds: ["role-1"],
  currentStatusId: "new",
  isAuthor: false,
  isAssignee: false,
};

describe("allowedNewStatusIds", () => {
  it("returns the unflagged transition for a plain role match, plus the current status", () => {
    const result = allowedNewStatusIds([transition({})], baseQuery);
    expect(new Set(result)).toEqual(new Set(["in-progress", "new"]));
  });

  it("excludes transitions for a different tracker or role", () => {
    const transitions = [
      transition({ trackerId: "other-tracker" }),
      transition({ roleId: "other-role" }),
    ];
    expect(allowedNewStatusIds(transitions, baseQuery)).toEqual([]);
  });

  it("excludes an author-flagged transition when the actor is not the author", () => {
    const transitions = [transition({ author: true, newStatusId: "author-only" })];
    expect(allowedNewStatusIds(transitions, baseQuery)).toEqual([]);
  });

  it("includes an author-flagged transition when the actor is the author", () => {
    const transitions = [transition({ author: true, newStatusId: "author-only" })];
    const result = allowedNewStatusIds(transitions, { ...baseQuery, isAuthor: true });
    expect(new Set(result)).toEqual(new Set(["author-only", "new"]));
  });

  it("does not leak an assignee-flagged transition to the author-only actor", () => {
    const transitions = [transition({ assignee: true, newStatusId: "assignee-only" })];
    const result = allowedNewStatusIds(transitions, { ...baseQuery, isAuthor: true });
    expect(result).toEqual([]);
  });

  it("includes both author- and assignee-flagged transitions when the actor is both", () => {
    const transitions = [
      transition({ author: true, newStatusId: "author-only" }),
      transition({ assignee: true, newStatusId: "assignee-only" }),
    ];
    const result = allowedNewStatusIds(transitions, { ...baseQuery, isAuthor: true, isAssignee: true });
    expect(new Set(result)).toEqual(new Set(["author-only", "assignee-only", "new"]));
  });

  it("returns nothing (not even the current status) when no transition matches at all", () => {
    expect(allowedNewStatusIds([], baseQuery)).toEqual([]);
  });
});

describe("canTransitionTo", () => {
  it("allows a registered transition target", () => {
    expect(canTransitionTo([transition({})], baseQuery, "in-progress")).toBe(true);
  });

  it("denies an unregistered transition target", () => {
    expect(canTransitionTo([transition({})], baseQuery, "closed")).toBe(false);
  });
});
