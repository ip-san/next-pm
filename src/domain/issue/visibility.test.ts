import { describe, expect, it } from "bun:test";
import { isPrivateIssueVisible } from "./visibility";

const privateIssue = { isPrivate: true, authorId: "author-1", assignedToId: "assignee-1" };
const publicIssue = { isPrivate: false, authorId: "author-1", assignedToId: "assignee-1" };

describe("isPrivateIssueVisible", () => {
  it("is always visible when the issue is not private, regardless of viewer", () => {
    expect(isPrivateIssueVisible(publicIssue, null, [])).toBe(true);
    expect(isPrivateIssueVisible(publicIssue, "someone-else", [])).toBe(true);
  });

  it("hides a private issue from an anonymous (not-logged-in) visitor", () => {
    expect(isPrivateIssueVisible(privateIssue, null, [{ issuesVisibility: "all" }])).toBe(false);
  });

  it("is visible to the issue's author regardless of role visibility setting", () => {
    expect(isPrivateIssueVisible(privateIssue, "author-1", [{ issuesVisibility: "own" }])).toBe(true);
  });

  it("is visible to the issue's assignee regardless of role visibility setting", () => {
    expect(isPrivateIssueVisible(privateIssue, "assignee-1", [{ issuesVisibility: "own" }])).toBe(true);
  });

  it("is visible to an unrelated user when any held role has issuesVisibility 'all'", () => {
    expect(isPrivateIssueVisible(privateIssue, "someone-else", [{ issuesVisibility: "all" }])).toBe(true);
  });

  it("hides a private issue from an unrelated user whose role is 'default'", () => {
    expect(isPrivateIssueVisible(privateIssue, "someone-else", [{ issuesVisibility: "default" }])).toBe(false);
  });

  it("hides a private issue from an unrelated user whose role is 'own'", () => {
    expect(isPrivateIssueVisible(privateIssue, "someone-else", [{ issuesVisibility: "own" }])).toBe(false);
  });

  it("resolves OR across multiple roles — one 'all' role is enough", () => {
    expect(
      isPrivateIssueVisible(privateIssue, "someone-else", [
        { issuesVisibility: "own" },
        { issuesVisibility: "all" },
      ]),
    ).toBe(true);
  });
});
