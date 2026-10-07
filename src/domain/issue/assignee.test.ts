import { describe, expect, it } from "bun:test";
import { assignablePrincipalIds, parseAssigneeValue } from "./assignee";

const assignableRole = new Map([
  ["role-assignable", { assignable: true }],
  ["role-not", { assignable: false }],
]);
const statuses = new Map<string, "active" | "registered" | "locked">([
  ["user-active", "active"],
  ["user-locked", "locked"],
  ["user-registered", "registered"],
  ["author-1", "active"],
  ["author-locked", "locked"],
]);
const noExtra = { authorId: null, currentAssignee: null };

describe("parseAssigneeValue", () => {
  it("reads a bare uuid as a user and a group:-prefixed value as a group", () => {
    expect(parseAssigneeValue("abc")).toEqual({ id: "abc", type: "user" });
    expect(parseAssigneeValue("group:abc")).toEqual({ id: "abc", type: "group" });
    expect(parseAssigneeValue("")).toBeNull();
  });
});

describe("assignablePrincipalIds", () => {
  it("offers an active member holding an assignable role", () => {
    const result = assignablePrincipalIds(
      [{ userId: "user-active", groupId: null, roleIds: ["role-assignable"] }],
      assignableRole,
      statuses,
      noExtra,
    );
    expect([...result.userIds]).toEqual(["user-active"]);
  });

  it("rejects a member whose only role is not flagged assignable", () => {
    const result = assignablePrincipalIds(
      [{ userId: "user-active", groupId: null, roleIds: ["role-not"] }],
      assignableRole,
      statuses,
      noExtra,
    );
    expect(result.userIds.size).toBe(0);
  });

  it("rejects locked and merely registered members", () => {
    const result = assignablePrincipalIds(
      [
        { userId: "user-locked", groupId: null, roleIds: ["role-assignable"] },
        { userId: "user-registered", groupId: null, roleIds: ["role-assignable"] },
      ],
      assignableRole,
      statuses,
      noExtra,
    );
    expect(result.userIds.size).toBe(0);
  });

  it("offers a group member through an assignable role", () => {
    const result = assignablePrincipalIds(
      [{ userId: null, groupId: "group-1", roleIds: ["role-assignable"] }],
      assignableRole,
      statuses,
      noExtra,
    );
    expect([...result.groupIds]).toEqual(["group-1"]);
  });

  it("always offers an active author, even with no membership", () => {
    const result = assignablePrincipalIds([], assignableRole, statuses, { authorId: "author-1", currentAssignee: null });
    expect([...result.userIds]).toEqual(["author-1"]);
  });

  it("does not offer a locked author", () => {
    const result = assignablePrincipalIds([], assignableRole, statuses, { authorId: "author-locked", currentAssignee: null });
    expect(result.userIds.size).toBe(0);
  });

  it("keeps the current assignee offerable after they stop qualifying", () => {
    // Otherwise an issue whose assignee left the project (or was locked) could never be
    // saved again — the regression the _changed? guards in the actions worked around.
    const result = assignablePrincipalIds([], assignableRole, statuses, {
      authorId: null,
      currentAssignee: { id: "user-locked", type: "user" },
    });
    expect([...result.userIds]).toEqual(["user-locked"]);
  });

  it("keeps a current group assignee offerable", () => {
    const result = assignablePrincipalIds([], assignableRole, statuses, {
      authorId: null,
      currentAssignee: { id: "group-gone", type: "group" },
    });
    expect([...result.groupIds]).toEqual(["group-gone"]);
  });
});
