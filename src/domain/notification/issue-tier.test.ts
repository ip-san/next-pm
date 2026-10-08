import { describe, expect, it } from "bun:test";
import { notifyAboutIssue, type IssueNotifyEvent } from "./issue-tier";

const event: IssueNotifyEvent = {
  authorId: "author",
  assignee: { type: "user", id: "assignee" },
  previousAssignee: { type: "user", id: "old" },
};
const recipient = (userId: string, groupIds: string[] = []) => ({ userId, groupIds });

describe("notifyAboutIssue", () => {
  it("sends everything under all, and nothing under none", () => {
    expect(notifyAboutIssue("all", recipient("stranger"), event)).toBe(true);
    expect(notifyAboutIssue("none", recipient("author"), event)).toBe(false);
  });

  it("only_my_events: the author, the assignee, or the previous assignee", () => {
    expect(notifyAboutIssue("only_my_events", recipient("author"), event)).toBe(true);
    expect(notifyAboutIssue("only_my_events", recipient("assignee"), event)).toBe(true);
    expect(notifyAboutIssue("only_my_events", recipient("old"), event)).toBe(true);
    expect(notifyAboutIssue("only_my_events", recipient("stranger"), event)).toBe(false);
  });

  it("only_assigned: the assignee or the previous assignee, not the author alone", () => {
    expect(notifyAboutIssue("only_assigned", recipient("assignee"), event)).toBe(true);
    expect(notifyAboutIssue("only_assigned", recipient("author"), event)).toBe(false);
  });

  it("only_owner: the author only", () => {
    expect(notifyAboutIssue("only_owner", recipient("author"), event)).toBe(true);
    expect(notifyAboutIssue("only_owner", recipient("assignee"), event)).toBe(false);
  });

  it("still sends a watcher the issue mail under only_assigned, though they are neither author nor assignee", () => {
    const watched: IssueNotifyEvent = { ...event, watcherIds: ["watcher"] };
    expect(notifyAboutIssue("only_assigned", recipient("watcher"), watched)).toBe(true);
    expect(notifyAboutIssue("only_assigned", recipient("stranger"), watched)).toBe(false);
    expect(notifyAboutIssue("only_owner", recipient("watcher"), watched)).toBe(true);
    expect(notifyAboutIssue("none", recipient("watcher"), watched)).toBe(false);
  });

  it("counts a member of an assigned group as the assignee", () => {
    const groupEvent: IssueNotifyEvent = { authorId: "author", assignee: { type: "group", id: "g-1" }, previousAssignee: null };
    expect(notifyAboutIssue("only_assigned", recipient("member", ["g-1"]), groupEvent)).toBe(true);
    expect(notifyAboutIssue("only_assigned", recipient("outsider", ["g-2"]), groupEvent)).toBe(false);
  });
});
