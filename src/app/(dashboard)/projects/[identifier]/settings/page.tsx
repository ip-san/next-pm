import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ProjectSettingsTabs } from "../../project-settings-tabs";
import { ProjectSettingsForm } from "./project-settings-form";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "edit_project", project: projectContext, actor })) {
    notFound();
  }

  const [trackers, customFields, customValues] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleCustomFieldRepository().listForCustomizedType("Project"),
    new DrizzleCustomValueRepository().listForCustomized("Project", project.id),
  ]);
  const hasIssueTracking = project.enabledModules.includes("issue_tracking");
  const hasWiki = project.enabledModules.includes("wiki");
  const customValueByFieldId = Object.fromEntries(customValues.map((cv) => [cv.customFieldId, cv.value]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — 設定</h1>
      <ProjectSettingsTabs
        identifier={identifier}
        active="settings"
        visibleTabs={{
          settings: true,
          members: can({ permission: "manage_members", project: projectContext, actor }),
          versions: hasIssueTracking && can({ permission: "view_issues", project: projectContext, actor }),
          issueCategories: hasIssueTracking && can({ permission: "manage_issue_categories", project: projectContext, actor }),
          repositories: can({ permission: "manage_repository", project: projectContext, actor }),
          activities: can({ permission: "manage_project_activities", project: projectContext, actor }),
          wiki: hasWiki && can({ permission: "manage_wiki", project: projectContext, actor }),
        }}
      />
      <ProjectSettingsForm
        project={project}
        trackers={trackers}
        customFields={customFields}
        customValueByFieldId={customValueByFieldId}
        // Redmine's safe_attributes: these two are not edit_project's to change. The server
        // drops them when the actor lacks the permission, so leaving the controls out is
        // only about not showing a field whose value would be ignored.
        showPublicity={can({ permission: "select_project_publicity", project: projectContext, actor })}
        showModules={can({ permission: "select_project_modules", project: projectContext, actor })}
      />
    </main>
  );
}
