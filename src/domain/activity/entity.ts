export type ActivityEventType = "issue_created" | "issue_updated" | "news" | "message" | "wiki_edit" | "document" | "time_entry";

/** Redmine groups issue creation and issue journal updates under one "issue" filter checkbox. */
export type ActivityEventGroup = "issue" | "news" | "message" | "wiki_edit" | "document" | "time_entry";

export const ACTIVITY_EVENT_GROUPS: ActivityEventGroup[] = ["issue", "news", "message", "wiki_edit", "document", "time_entry"];

export interface ActivityEvent {
  type: ActivityEventType;
  id: string;
  authorId: string | null;
  title: string;
  excerpt: string;
  occurredAt: Date;
}
