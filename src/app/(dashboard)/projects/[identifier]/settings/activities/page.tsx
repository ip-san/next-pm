import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { resolveProjectActivities } from "@/domain/enumeration/project-activities";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ProjectSettingsTabs } from "../../../project-settings-tabs";
import { ProjectActivitiesForm } from "./project-activities-form";

export const dynamic = "force-dynamic";

export default async function ProjectActivitiesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  // manage_project_activities belongs to the time_tracking module, so `can` already answers
  // false for a project with time tracking switched off.
  if (!can({ permission: "manage_project_activities", project: projectContext, actor })) {
    notFound();
  }

  const [systemActivities, overrides] = await Promise.all([
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleProjectActivityRepository().listOverridesForProject(project.id),
  ]);
  // Inactive ones included: this is the screen where they are switched back on.
  const effective = resolveProjectActivities(systemActivities, overrides, { includeInactive: true });
  const activeByActivityId = Object.fromEntries(
    systemActivities.map((activity, index) => [activity.id, effective[index]?.active ?? activity.active]),
  );
  const hasIssueTracking = project.enabledModules.includes("issue_tracking");

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — 作業分類</h1>
      <ProjectSettingsTabs
        identifier={identifier}
        active="activities"
        visibleTabs={{
          settings: can({ permission: "edit_project", project: projectContext, actor }),
          members: can({ permission: "manage_members", project: projectContext, actor }),
          versions: hasIssueTracking && can({ permission: "view_issues", project: projectContext, actor }),
          issueCategories: hasIssueTracking && can({ permission: "manage_issue_categories", project: projectContext, actor }),
          activities: true,
        }}
      />
      <p className="text-sm text-gray-600">
        このプロジェクトで使用する作業分類を選びます。チェックを外した分類は、このプロジェクトの工数入力に表示されなくなります（既に記録済みの工数はそのまま残ります）。
      </p>
      <ProjectActivitiesForm
        projectIdentifier={identifier}
        activities={systemActivities.map((activity) => ({ id: activity.id, name: activity.name }))}
        activeByActivityId={activeByActivityId}
      />
    </main>
  );
}
