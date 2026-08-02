import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
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

  const trackers = await new DrizzleTrackerRepository().listAll();
  const hasIssueTracking = project.enabledModules.includes("issue_tracking");

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
        }}
      />
      <ProjectSettingsForm project={project} trackers={trackers} />
    </main>
  );
}
