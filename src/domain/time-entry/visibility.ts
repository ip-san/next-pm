import type { TimeEntriesVisibility } from "@/domain/role/entity";
import type { TimeEntry } from "./entity";

type VisibilityRole = { timeEntriesVisibility: TimeEntriesVisibility };

/**
 * Pure re-implementation of TimeEntry#visible? (app/models/time_entry.rb)'s role block.
 * The caller is responsible for the `view_time_entries` permission check itself — this
 * only answers the per-role narrowing Redmine layers on top of it: a role with
 * `time_entries_visibility == "own"` sees only entries whose *user* (the person the time
 * is attributed to, not the author who typed it in) is the viewer.
 *
 * Redmine's block form returns true as soon as ANY of the actor's roles says yes, so a
 * user holding both an "all" role and an "own" role sees everything.
 */
export function isTimeEntryVisible(
  entry: Pick<TimeEntry, "userId">,
  userId: string | null,
  roles: VisibilityRole[],
): boolean {
  return roles.some((role) => {
    if (role.timeEntriesVisibility === "all") return true;
    return userId !== null && entry.userId === userId;
  });
}

/**
 * Pure re-implementation of TimeEntry#editable_by?:
 *   visible?(usr) && ((usr == user && edit_own_time_entries) || edit_time_entries)
 * Both the delete and the edit path go through this in Redmine (TimelogController's
 * `check_editability` / `find_time_entries`), so deleting needs exactly the same rights
 * as editing — there is no separate delete permission.
 */
export function canEditTimeEntry(input: {
  entry: Pick<TimeEntry, "userId">;
  userId: string | null;
  visible: boolean;
  canEditTimeEntries: boolean;
  canEditOwnTimeEntries: boolean;
}): boolean {
  if (!input.visible) return false;
  if (input.canEditTimeEntries) return true;
  return input.userId !== null && input.entry.userId === input.userId && input.canEditOwnTimeEntries;
}
