import type { MailNotificationOption } from "./mail-notification";

/**
 * What an issue event says about who it concerns: its author, its assignee now, and the assignee it
 * had before the change (Redmine's `previous_assignee`, so someone who was just unassigned still hears).
 */
export interface IssueNotifyEvent {
  authorId: string | null;
  assignee: { type: "user" | "group"; id: string } | null;
  previousAssignee: { type: "user" | "group"; id: string } | null;
  /**
   * The issue's watchers who may see it. Redmine's notified_watchers doesn't apply notify_about?: a
   * watcher gets the mail unless their mail_notification is none, so the tier never narrows them.
   */
  watcherIds?: readonly string[];
}

/** Redmine's `is_or_belongs_to?`: the user is the assignee, or is a member of an assigned group. */
function assignedTo(assignee: { type: "user" | "group"; id: string } | null, userId: string, groupIds: readonly string[]): boolean {
  if (!assignee) return false;
  return assignee.type === "user" ? assignee.id === userId : groupIds.includes(assignee.id);
}

/**
 * Redmine's User#notify_about? for an Issue (app/models/user.rb). `all` sends everything and `none`
 * nothing; the other three narrow by the user's relation to the issue. `selected` is not offered by
 * next-pm, so it isn't handled here.
 */
export function notifyAboutIssue(
  option: MailNotificationOption,
  recipient: { userId: string; groupIds: readonly string[] },
  event: IssueNotifyEvent,
): boolean {
  if (option === "all") return true;
  if (option === "none") return false;
  if (event.watcherIds?.includes(recipient.userId)) return true;

  const isAuthor = event.authorId !== null && event.authorId === recipient.userId;
  const isAssignee = assignedTo(event.assignee, recipient.userId, recipient.groupIds);
  const wasAssignee = assignedTo(event.previousAssignee, recipient.userId, recipient.groupIds);

  switch (option) {
    case "only_my_events":
      return isAuthor || isAssignee || wasAssignee;
    case "only_assigned":
      return isAssignee || wasAssignee;
    case "only_owner":
      return isAuthor;
  }
}

/** The event for an issue, with the assignee it had before the change when there was an update. */
export function issueNotifyEvent(
  issue: { authorId: string | null; assignedToId: string | null; assignedToType: "user" | "group" | null },
  previous: { assignedToId: string | null; assignedToType: "user" | "group" | null } | null,
  watcherIds: readonly string[] = [],
): IssueNotifyEvent {
  const assigneeOf = (value: { assignedToId: string | null; assignedToType: "user" | "group" | null }) =>
    value.assignedToId && value.assignedToType ? { type: value.assignedToType, id: value.assignedToId } : null;
  return {
    authorId: issue.authorId,
    assignee: assigneeOf(issue),
    previousAssignee: previous ? assigneeOf(previous) : null,
    watcherIds,
  };
}
