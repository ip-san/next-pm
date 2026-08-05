export type ActivityEventType = "issue_created" | "issue_updated" | "news" | "message" | "wiki_edit" | "document" | "time_entry" | "changeset";

/** Redmine groups issue creation and issue journal updates under one "issue" filter checkbox. */
export type ActivityEventGroup = "issue" | "news" | "message" | "wiki_edit" | "document" | "time_entry" | "changeset";

export const ACTIVITY_EVENT_GROUPS: ActivityEventGroup[] = ["issue", "news", "message", "wiki_edit", "document", "time_entry", "changeset"];

export interface ActivityEvent {
  type: ActivityEventType;
  id: string;
  authorId: string | null;
  title: string;
  excerpt: string;
  occurredAt: Date;
}

/** The project-relative path an activity event links to — shared by the HTML page and the atom feed so the two can never disagree on where an event points. */
export function activityEventPath(identifier: string, event: Pick<ActivityEvent, "type" | "id">): string {
  switch (event.type) {
    case "issue_created":
    case "issue_updated":
      return `/projects/${identifier}/issues/${event.id}`;
    case "news":
      return `/projects/${identifier}/news/${event.id}`;
    case "message":
      return `/projects/${identifier}/boards`;
    case "wiki_edit":
      return `/projects/${identifier}/wiki/${encodeURIComponent(event.id)}`;
    case "document":
      return `/projects/${identifier}/documents/${event.id}`;
    case "time_entry":
      return `/projects/${identifier}/time-entries`;
    case "changeset":
      return `/projects/${identifier}/repository/revisions/${event.id}`;
  }
}
