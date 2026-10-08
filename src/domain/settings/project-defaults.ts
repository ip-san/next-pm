import { PROJECT_MODULES, type ProjectModule } from "@/domain/authorization/permission-registry";

/**
 * Redmine's settings.yml keys for what a *new* project starts out as, plus the role a
 * non-admin creator is given. Kept in its own module rather than folded into
 * general-settings.ts because these five only ever matter on the new-project path — same
 * split commit-keywords.ts already uses.
 *
 * As with the other settings modules, each default preserves next-pm's prior hardcoded
 * behavior rather than Redmine's own default where the two differ, so adding the form
 * changes nothing until an admin changes a value. The one that differs:
 * default_projects_modules — Redmine ships all ten modules on, next-pm's new-project form
 * only ever pre-checked issue_tracking.
 */
export const PROJECT_DEFAULT_SETTING_KEYS = [
  "default_projects_public",
  "default_projects_modules",
  "default_projects_tracker_ids",
  "sequential_project_identifiers",
  "new_project_user_role_id",
] as const;

export type ProjectDefaultSettingKey = (typeof PROJECT_DEFAULT_SETTING_KEYS)[number];

export const PROJECT_DEFAULT_SETTINGS: Record<ProjectDefaultSettingKey, string> = {
  default_projects_public: "1",
  default_projects_modules: "issue_tracking",
  // Empty means "every tracker", mirroring Redmine's `default.is_a?(Array)` fallback in
  // Project#initialize: an unset setting selects all trackers, an explicitly empty list
  // selects none. Those two are distinguishable here as absent vs. the literal "-".
  default_projects_tracker_ids: "",
  sequential_project_identifiers: "0",
  // Redmine: `Role.givable.find_by_id(...) || Role.givable.first` — empty means "the first
  // assignable role".
  new_project_user_role_id: "",
};

/** The sentinel a stored (but deliberately empty) tracker list uses, so it differs from "unset". */
const EMPTY_TRACKER_LIST = "-";

export interface ProjectDefaults {
  isPublic: boolean;
  enabledModules: ProjectModule[];
  /** null means "all trackers" — Redmine's behavior when the setting was never set. */
  trackerIds: string[] | null;
  sequentialIdentifiers: boolean;
  /** null means "the first assignable role". */
  newProjectUserRoleId: string | null;
}

export function resolveProjectDefaults(overrides: Record<string, string>): ProjectDefaults {
  const modulesRaw = overrides.default_projects_modules ?? PROJECT_DEFAULT_SETTINGS.default_projects_modules;
  const trackersRaw = overrides.default_projects_tracker_ids ?? PROJECT_DEFAULT_SETTINGS.default_projects_tracker_ids;
  const roleIdRaw = overrides.new_project_user_role_id ?? PROJECT_DEFAULT_SETTINGS.new_project_user_role_id;

  return {
    isPublic: (overrides.default_projects_public ?? PROJECT_DEFAULT_SETTINGS.default_projects_public) === "1",
    enabledModules: modulesRaw
      .split(",")
      .map((name) => name.trim())
      .filter((name): name is ProjectModule => (PROJECT_MODULES as readonly string[]).includes(name)),
    trackerIds:
      trackersRaw === EMPTY_TRACKER_LIST
        ? []
        : trackersRaw.length === 0
          ? null
          : trackersRaw
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
    sequentialIdentifiers: (overrides.sequential_project_identifiers ?? PROJECT_DEFAULT_SETTINGS.sequential_project_identifiers) === "1",
    newProjectUserRoleId: roleIdRaw.length > 0 ? roleIdRaw : null,
  };
}

/** Serializes a tracker selection back into storage, keeping "none" distinguishable from "unset". */
export function serializeDefaultTrackerIds(trackerIds: string[] | null): string {
  if (trackerIds === null) return "";
  return trackerIds.length === 0 ? EMPTY_TRACKER_LIST : trackerIds.join(",");
}
