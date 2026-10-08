/** Mirrors Redmine's UserPreference#auto_watch_on trigger keys. */
export type AutoWatchTrigger = "issue_created" | "issue_contributed_to" | "issue_assigned_to_me";

export const AUTO_WATCH_TRIGGERS: AutoWatchTrigger[] = ["issue_created", "issue_contributed_to", "issue_assigned_to_me"];

/** Redmine UserPreference#comments_sorting — oldest first ("asc") or newest first ("desc"). */
export const COMMENTS_SORTING_VALUES = ["asc", "desc"] as const;
export type CommentsSorting = (typeof COMMENTS_SORTING_VALUES)[number];

export interface UserPreferences {
  userId: string;
  autoWatchOn: AutoWatchTrigger[];
  /** Redmine's hide_mail: keep my address off my profile and out of user listings. */
  hideMail: boolean;
  timeZone: string | null;
  commentsSorting: CommentsSorting;
  noSelfNotified: boolean;
}

/** The row's defaults, for a user who has never saved preferences (Redmine's UserPreference.new). */
export const DEFAULT_USER_PREFERENCES: Omit<UserPreferences, "userId"> = {
  autoWatchOn: AUTO_WATCH_TRIGGERS,
  hideMail: true,
  timeZone: null,
  commentsSorting: "asc",
  noSelfNotified: true,
};

/** All three triggers enabled — there's no prior next-pm behavior to preserve here (auto-watch is new), so this defaults to the most useful behavior rather than an opt-in. */
export function resolveAutoWatchOn(preferences: UserPreferences | null): AutoWatchTrigger[] {
  return preferences?.autoWatchOn ?? AUTO_WATCH_TRIGGERS;
}

export function resolvePreferences(preferences: UserPreferences | null, userId: string): UserPreferences {
  return preferences ?? { userId, ...DEFAULT_USER_PREFERENCES };
}
