import type { ProjectModule } from "@/domain/authorization/permission-registry";
import { resolveProjectDefaults, serializeDefaultTrackerIds, type ProjectDefaults } from "@/domain/settings/project-defaults";
import type { SettingsRepository } from "@/domain/settings/repository";

export async function loadProjectDefaults(settingsRepository: SettingsRepository): Promise<ProjectDefaults> {
  return resolveProjectDefaults(await settingsRepository.getAll());
}

export interface UpdateProjectDefaultsInput {
  isPublic: boolean;
  enabledModules: ProjectModule[];
  /** null means "every tracker" — see the domain module's note on unset vs. empty. */
  trackerIds: string[] | null;
  sequentialIdentifiers: boolean;
  newProjectUserRoleId: string | null;
}

export async function updateProjectDefaults(
  settingsRepository: SettingsRepository,
  input: UpdateProjectDefaultsInput,
): Promise<void> {
  await settingsRepository.setMany({
    default_projects_public: input.isPublic ? "1" : "0",
    default_projects_modules: input.enabledModules.join(","),
    default_projects_tracker_ids: serializeDefaultTrackerIds(input.trackerIds),
    sequential_project_identifiers: input.sequentialIdentifiers ? "1" : "0",
    new_project_user_role_id: input.newProjectUserRoleId ?? "",
  });
}
