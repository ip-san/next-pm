/**
 * Union + dedupe recipient ids, dropping nulls, then excluding the actor who triggered the
 * event — mirrors Redmine's notified_users pattern (author/assignee/watchers/project members)
 * without its per-user notification-preference system (Setting.notified_events etc., out of
 * scope here).
 */
export function unionRecipients(groups: (string | null | undefined)[][], excludeUserId: string | null): string[] {
  const ids = new Set(groups.flat().filter((id): id is string => Boolean(id)));
  if (excludeUserId) {
    ids.delete(excludeUserId);
  }
  return [...ids];
}
