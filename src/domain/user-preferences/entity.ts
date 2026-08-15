/** Mirrors Redmine's UserPreference#auto_watch_on trigger keys. */
export type AutoWatchTrigger = "issue_created" | "issue_contributed_to" | "issue_assigned_to_me";

export const AUTO_WATCH_TRIGGERS: AutoWatchTrigger[] = ["issue_created", "issue_contributed_to", "issue_assigned_to_me"];

export interface UserPreferences {
  userId: string;
  autoWatchOn: AutoWatchTrigger[];
}

/** All three triggers enabled — there's no prior next-pm behavior to preserve here (auto-watch is new), so this defaults to the most useful behavior rather than an opt-in. */
export function resolveAutoWatchOn(preferences: UserPreferences | null): AutoWatchTrigger[] {
  return preferences?.autoWatchOn ?? AUTO_WATCH_TRIGGERS;
}
