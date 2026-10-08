import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import { isOverridingChange } from "@/domain/enumeration/project-activities";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
import type { ProjectRepository } from "@/domain/project/repository";

export class UpdateProjectActivitiesNotPermittedError extends Error {
  constructor() {
    super("The acting user may not manage this project's activities.");
    this.name = "UpdateProjectActivitiesNotPermittedError";
  }
}

export interface UpdateProjectActivitiesRepositories {
  projectRepository: ProjectRepository;
  enumerationRepository: EnumerationRepository;
  projectActivityRepository: ProjectActivityRepository;
}

/**
 * Redmine's ProjectEnumerationsController#update, as
 * Project#update_or_create_time_entry_activities. For each system-wide activity the project
 * declares whether it is active here:
 *
 * - differs from the system row and no override exists -> create one, and move this
 *   project's time entries from the system activity onto it, so they keep pointing at the
 *   activity the project actually uses (Redmine does the same `update_all`).
 * - differs and an override exists -> flip the override's flag.
 * - matches the system row again -> the override is no longer an override
 *   (Enumeration.overriding_change? is false), so move the time entries back and delete it.
 *   The order matters: time_entries.activity_id has no ON DELETE action, so deleting first
 *   would be refused by the database.
 *
 * Redmine's overriding_change? also compares the activity's custom field values; next-pm
 * has no custom fields on enumerations, so the active flag is the whole comparison.
 */
export async function updateProjectActivities(
  repositories: UpdateProjectActivitiesRepositories,
  input: { projectId: string; activeByActivityId: Record<string, boolean>; actor: AuthorizationActor },
): Promise<void> {
  const project = await repositories.projectRepository.findById(input.projectId);
  if (!project) {
    throw new Error(`Project ${input.projectId} not found`);
  }
  if (!can({ permission: "manage_project_activities", project: projectAuthorizationContext(project), actor: input.actor })) {
    throw new UpdateProjectActivitiesNotPermittedError();
  }

  const systemActivities = await repositories.enumerationRepository.listByType("TimeEntryActivity");
  const overrides = await repositories.projectActivityRepository.listOverridesForProject(project.id);
  const overrideByParentId = new Map(overrides.flatMap((override) => (override.parentId ? [[override.parentId, override]] : [])));

  for (const activity of systemActivities) {
    const desiredActive = input.activeByActivityId[activity.id];
    if (desiredActive === undefined) continue;

    const override = overrideByParentId.get(activity.id);
    const wanted = isOverridingChange(activity, { active: desiredActive });

    if (wanted && !override) {
      const created = await repositories.projectActivityRepository.createOverride({
        projectId: project.id,
        parent: activity,
        active: desiredActive,
      });
      await repositories.projectActivityRepository.reassignTimeEntries(project.id, activity.id, created.id);
    } else if (wanted && override) {
      if (override.active !== desiredActive) {
        await repositories.projectActivityRepository.updateOverride(override.id, { active: desiredActive });
      }
    } else if (!wanted && override) {
      await repositories.projectActivityRepository.reassignTimeEntries(project.id, override.id, activity.id);
      await repositories.projectActivityRepository.deleteOverride(override.id);
    }
  }
}
