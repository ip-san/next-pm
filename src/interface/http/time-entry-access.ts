import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { TimeEntriesVisibility } from "@/domain/role/entity";
import type { TimeEntry } from "@/domain/time-entry/entity";
import { isTimeEntryVisible } from "@/domain/time-entry/visibility";

/**
 * Roles to feed into `isTimeEntryVisible`, the time-entry twin of
 * resolve-actor.ts's `issuesVisibilityRoles` — an admin carries no real roles, so it gets a
 * synthetic "all" rather than every call site special-casing `actor.kind === "admin"`.
 */
export function timeEntriesVisibilityRoles(actor: AuthorizationActor): { timeEntriesVisibility: TimeEntriesVisibility }[] {
  switch (actor.kind) {
    case "admin":
      return [{ timeEntriesVisibility: "all" }];
    case "member":
      return actor.roles;
    case "non_member":
    case "anonymous":
      return [actor.role];
  }
}

/**
 * Narrows a list of entries to what the actor may see. Every read path over time entries
 * has to run through this: `view_time_entries` alone is not the whole check, because a role
 * with `time_entries_visibility == "own"` must only ever see its own rows.
 */
export function filterVisibleTimeEntries<T extends Pick<TimeEntry, "userId">>(
  entries: T[],
  userId: string | null,
  actor: AuthorizationActor,
): T[] {
  const roles = timeEntriesVisibilityRoles(actor);
  return entries.filter((entry) => isTimeEntryVisible(entry, userId, roles));
}
