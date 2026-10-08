import type { Enumeration } from "@/domain/enumeration/entity";
import { resolveProjectActivities } from "@/domain/enumeration/project-activities";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";
import type { EnumerationRepository } from "@/domain/enumeration/repository";

export interface ProjectActivityView {
  /** What a picker in this project may offer — Redmine's Project#activities. */
  offered: Enumeration[];
  /**
   * Every activity an existing time entry of this project could point at, by id: the system
   * rows and this project's overrides alike. A deactivated activity still labels the entries
   * already recorded against it, so a display lookup must not use `offered`.
   */
  byId: Map<string, Enumeration>;
}

export async function loadProjectActivities(
  repositories: { enumerationRepository: EnumerationRepository; projectActivityRepository: ProjectActivityRepository },
  projectId: string,
): Promise<ProjectActivityView> {
  const [systemActivities, overrides] = await Promise.all([
    repositories.enumerationRepository.listByType("TimeEntryActivity"),
    repositories.projectActivityRepository.listOverridesForProject(projectId),
  ]);

  return {
    offered: resolveProjectActivities(systemActivities, overrides),
    byId: new Map([...systemActivities, ...overrides].map((activity) => [activity.id, activity])),
  };
}
