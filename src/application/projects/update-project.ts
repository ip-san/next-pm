import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository, ProjectSettingsUpdate } from "@/domain/project/repository";

export class UpdateProjectNotPermittedError extends Error {
  constructor() {
    super("The acting user may not edit this project.");
    this.name = "UpdateProjectNotPermittedError";
  }
}

/**
 * Redmine's ProjectsController#update. Two of the fields on the settings form are not
 * `edit_project`'s to change: `is_public` needs select_project_publicity and
 * `enabled_module_names` needs select_project_modules (Project's `safe_attributes :if`
 * blocks). Redmine *drops* an unpermitted attribute rather than rejecting the request, and
 * so does this — which is also why the check can't be left to the form: an unchecked
 * checkbox and a checkbox that was never rendered post identically, so trusting the
 * submission would silently make the project private the first time someone without the
 * permission saved the settings page.
 */
export async function updateProject(
  projectRepository: ProjectRepository,
  projectId: string,
  settings: ProjectSettingsUpdate,
  options: { actor: AuthorizationActor },
): Promise<Project> {
  const existing = await projectRepository.findById(projectId);
  if (!existing) {
    throw new Error(`Project ${projectId} not found`);
  }

  const projectContext = projectAuthorizationContext(existing);
  const allowed = (permission: "edit_project" | "select_project_publicity" | "select_project_modules") =>
    can({ permission, project: projectContext, actor: options.actor });

  if (!allowed("edit_project")) {
    throw new UpdateProjectNotPermittedError();
  }

  return projectRepository.updateSettings(projectId, {
    ...settings,
    isPublic: allowed("select_project_publicity") ? settings.isPublic : existing.isPublic,
    enabledModules: allowed("select_project_modules") ? settings.enabledModules : existing.enabledModules,
  });
}
