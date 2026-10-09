import Link from "next/link";
import { can, canGlobally, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import { translate } from "@/domain/i18n/messages";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentLocale } from "@/interface/http/locale";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, resolveGlobalRoles, toAuthorizationProject } from "@/interface/http/resolve-actor";

// Always needs a live DB read with no per-request caching benefit — opt out of static
// prerendering so `next build` doesn't try to reach Postgres at build time.
export const dynamic = "force-dynamic";

export default async function ProjectsIndexPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  const allProjects = await new DrizzleProjectRepository().listAll();

  // Mirrors Project.visible_condition (public, or the actor is a member/admin) — same
  // per-project can({permission: "view_project"}) check the admin index and REST API's
  // GET /projects already use, so an anonymous or non-admin visitor sees exactly the set
  // they're entitled to and nothing more.
  const visible = [];
  const visibleActorById = new Map<string, AuthorizationActor>();
  for (const project of allProjects) {
    const { actor } = await resolveActor(user, project.id);
    if (can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
      visible.push(project);
      visibleActorById.set(project.id, actor);
    }
  }
  const projectById = new Map(visible.map((project) => [project.id, project]));

  // Redmine shows "New project" to anyone `authorize_global` would let through: add_project
  // held anywhere, or add_subprojects on some project they can see.
  const canCreateProject =
    user !== null &&
    (canGlobally({ permission: "add_project", isAdmin: user.isAdmin, roles: await resolveGlobalRoles(user) }) ||
      visible.some((project) => project.status === "active"
        ? can({ permission: "add_subprojects", project: toAuthorizationProject(project), actor: visibleActorById.get(project.id)! })
        : false));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "projects.title")}</h1>
        {canCreateProject ? (
          <Link href="/projects/new" className="underline text-sm">
            {translate(locale, "projects.newProject")}
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {visible.map((project) => (
          <li key={project.id} className="border rounded p-3">
            <Link href={`/projects/${project.identifier}`} className="font-medium hover:underline">
              {project.name}
            </Link>
            {project.parentId ? (
              <span className="text-xs text-gray-500 ml-2">{translate(locale, "projects.parent")}: {projectById.get(project.parentId)?.name ?? "-"}</span>
            ) : null}
            {project.description ? <p className="text-xs text-gray-500 mt-1">{project.description}</p> : null}
          </li>
        ))}
        {visible.length === 0 ? <li className="text-gray-400">{translate(locale, "projects.noneVisible")}</li> : null}
      </ul>
    </main>
  );
}
