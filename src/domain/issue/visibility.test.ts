import { describe, expect, it } from "bun:test";
import { filterMembersVisibleToPrivateIssue, filterUserIdsVisibleToPrivateIssue, isPrivateIssueVisible } from "./visibility";

const privateIssue = { isPrivate: true, authorId: "author-1", assignedToId: "assignee-1", assignedToType: "user" as const };
const publicIssue = { isPrivate: false, authorId: "author-1", assignedToId: "assignee-1", assignedToType: "user" as const };
const privateGroupAssigned = { isPrivate: true, authorId: "author-1", assignedToId: "group-1", assignedToType: "group" as const };

describe("isPrivateIssueVisible", () => {
  it("is always visible when the issue is not private, regardless of viewer", () => {
    expect(isPrivateIssueVisible(publicIssue, null, [], [])).toBe(true);
    expect(isPrivateIssueVisible(publicIssue, "someone-else", [], [])).toBe(true);
  });

  it("hides a private issue from an anonymous (not-logged-in) visitor", () => {
    expect(isPrivateIssueVisible(privateIssue, null, [], [{ issuesVisibility: "all" }])).toBe(false);
  });

  it("is visible to the issue's author regardless of role visibility setting", () => {
    expect(isPrivateIssueVisible(privateIssue, "author-1", [], [{ issuesVisibility: "own" }])).toBe(true);
  });

  it("is visible to the issue's assignee regardless of role visibility setting", () => {
    expect(isPrivateIssueVisible(privateIssue, "assignee-1", [], [{ issuesVisibility: "own" }])).toBe(true);
  });

  it("is visible to an unrelated user when any held role has issuesVisibility 'all'", () => {
    expect(isPrivateIssueVisible(privateIssue, "someone-else", [], [{ issuesVisibility: "all" }])).toBe(true);
  });

  it("hides a private issue from an unrelated user whose role is 'default'", () => {
    expect(isPrivateIssueVisible(privateIssue, "someone-else", [], [{ issuesVisibility: "default" }])).toBe(false);
  });

  it("hides a private issue from an unrelated user whose role is 'own'", () => {
    expect(isPrivateIssueVisible(privateIssue, "someone-else", [], [{ issuesVisibility: "own" }])).toBe(false);
  });

  it("resolves OR across multiple roles — one 'all' role is enough", () => {
    expect(
      isPrivateIssueVisible(privateIssue, "someone-else", [], [
        { issuesVisibility: "own" },
        { issuesVisibility: "all" },
      ]),
    ).toBe(true);
  });

  it("is visible to a member of the group the issue is assigned to", () => {
    expect(isPrivateIssueVisible(privateGroupAssigned, "member-1", ["group-1"], [{ issuesVisibility: "own" }])).toBe(true);
  });

  it("hides a group-assigned private issue from a non-member of that group", () => {
    expect(isPrivateIssueVisible(privateGroupAssigned, "outsider-1", ["group-2"], [{ issuesVisibility: "own" }])).toBe(false);
  });

  it("does not treat a matching user id as the group assignee when assignedToType is 'group'", () => {
    expect(isPrivateIssueVisible(privateGroupAssigned, "group-1", [], [{ issuesVisibility: "own" }])).toBe(false);
  });
});

describe("filterMembersVisibleToPrivateIssue", () => {
  const rolesById = new Map([
    ["role-all", { issuesVisibility: "all" as const }],
    ["role-default", { issuesVisibility: "default" as const }],
    ["role-own", { issuesVisibility: "own" as const }],
  ]);
  const members = [
    { userId: "user-all", roleIds: ["role-all"] },
    { userId: "user-default", roleIds: ["role-default"] },
    { userId: "user-multi", roleIds: ["role-own", "role-all"] },
  ];

  it("returns every member unchanged when the issue is not private", () => {
    expect(filterMembersVisibleToPrivateIssue(publicIssue, members, rolesById)).toEqual(members);
  });

  it("keeps only members holding a role with issuesVisibility 'all' when the issue is private", () => {
    const visible = filterMembersVisibleToPrivateIssue(privateIssue, members, rolesById);
    expect(visible.map((m) => m.userId)).toEqual(["user-all", "user-multi"]);
  });

  it("drops a member whose role id isn't found in the map", () => {
    const visible = filterMembersVisibleToPrivateIssue(privateIssue, [{ userId: "user-unknown", roleIds: ["missing"] }], rolesById);
    expect(visible).toEqual([]);
  });
});

describe("filterUserIdsVisibleToPrivateIssue", () => {
  const rolesByUserId = new Map([
    ["watcher-all", [{ issuesVisibility: "all" as const }]],
    ["watcher-own", [{ issuesVisibility: "own" as const }]],
    ["author-1", [{ issuesVisibility: "own" as const }]],
    ["assignee-1", [{ issuesVisibility: "own" as const }]],
  ]);
  const watchers = ["watcher-all", "watcher-own", "author-1", "assignee-1", "ex-member"];

  it("returns every watcher unchanged when the issue is not private", () => {
    expect(filterUserIdsVisibleToPrivateIssue(publicIssue, watchers, rolesByUserId)).toEqual(watchers);
  });

  it("drops watchers who could not see the issue once it became private", () => {
    // Regression: a watcher keeps watching across the edit that turns an issue private, and
    // Redmine's notified_watchers rejects anyone the issue isn't visible to. "watcher-own"
    // and the ex-member must not be mailed the subject or the note.
    expect(filterUserIdsVisibleToPrivateIssue(privateIssue, watchers, rolesByUserId)).toEqual([
      "watcher-all",
      "author-1",
      "assignee-1",
    ]);
  });

  it("drops a watcher with no roles on the project at all", () => {
    expect(filterUserIdsVisibleToPrivateIssue(privateIssue, ["ex-member"], rolesByUserId)).toEqual([]);
  });
});
