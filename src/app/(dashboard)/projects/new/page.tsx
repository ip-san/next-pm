import { notFound } from "next/navigation";
import { defaultMemberRole } from "@/application/projects/create-project";
import { loadProjectDefaults } from "@/application/settings/project-defaults";
import { canGlobally } from "@/domain/authorization/authorization-service";
import { nextProjectIdentifier } from "@/domain/project/next-identifier";
import { hasPermission } from "@/domain/role/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission, resolveGlobalRoles } from "@/interface/http/resolve-actor";
import { ProjectForm } from "./project-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    notFound();
  }

  // Redmine's `authorize_global` on projects#new passes for either permission mapped to the
  // action: add_project held anywhere opens a root project, add_subprojects on some project
  // opens a subproject of it. Holding neither means there is nothing this form could create.
  const globalRoles = await resolveGlobalRoles(user);
  const mayCreateRoot = canGlobally({ permission: "add_project", isAdmin: user.isAdmin, roles: globalRoles });
  const parentCandidates = await listProjectsWithPermission(user, "add_subprojects");
  if (!mayCreateRoot && parentCandidates.length === 0) {
    notFound();
  }

  const [trackers, defaults, assignableRoles, allProjects] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    loadProjectDefaults(new DrizzleSettingsRepository()),
    new DrizzleRoleRepository().listGivable(),
    new DrizzleProjectRepository().listAll(),
  ]);

  // Which fields a non-admin may fill in is decided by the role they will be *given*, not by
  // the roles they hold elsewhere — Project's safe_attributes :if blocks consult
  // default_member_role for a new record. createProject re-applies this server side.
  const creatorRole = defaultMemberRole(assignableRoles, defaults.newProjectUserRoleId);
  const mayChoose = (permission: "select_project_publicity" | "select_project_modules") =>
    user.isAdmin || (creatorRole !== null && hasPermission(creatorRole, permission));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">新しいプロジェクト</h1>
      <ProjectForm
        projects={parentCandidates}
        trackers={trackers}
        allowNoParent={mayCreateRoot}
        showPublicity={mayChoose("select_project_publicity")}
        showModules={mayChoose("select_project_modules")}
        defaults={{
          isPublic: defaults.isPublic,
          enabledModules: defaults.enabledModules,
          trackerIds: defaults.trackerIds,
          identifier: defaults.sequentialIdentifiers ? nextProjectIdentifier(allProjects.map((project) => project.identifier)) : null,
        }}
      />
    </main>
  );
}
