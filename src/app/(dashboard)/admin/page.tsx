import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { DeleteProjectForm } from "../projects/delete-project-form";
import { ProjectStatusButton } from "../projects/project-status-button";
import { currentLocale } from "@/interface/http/locale";
import { translate, type MessageKey } from "@/domain/i18n/messages";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const ADMIN_SECTIONS = [
  { href: "/admin/users", labelKey: "admin.users" },
  { href: "/admin/groups", labelKey: "admin.groups" },
  { href: "/admin/ldap-auth-sources", labelKey: "admin.ldapAuth" },
  { href: "/admin/roles", labelKey: "admin.roles" },
  { href: "/admin/trackers", labelKey: "admin.trackers" },
  { href: "/admin/issue-statuses", labelKey: "admin.issueStatuses" },
  { href: "/admin/workflows", labelKey: "admin.workflows" },
  { href: "/admin/custom-fields", labelKey: "admin.customFields" },
  { href: "/admin/enumerations", labelKey: "admin.enumerations" },
  { href: "/admin/settings", labelKey: "admin.settings" },
  { href: "/admin/info", labelKey: "admin.info" },
] as const;

const STATUS_LABEL: Record<string, MessageKey> = {
  active: "admin.statusActive",
  closed: "admin.statusClosed",
  archived: "admin.statusArchived",
};

export default async function AdminIndexPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const projects = await new DrizzleProjectRepository().listAll();
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  return (
    <main className="p-8 flex flex-col gap-8">
      <h1 className="text-xl font-semibold">{translate(locale, "admin.title")}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{translate(locale, "admin.configuration")}</h2>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {ADMIN_SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="hover:underline">
              {translate(locale, section.labelKey)}
            </Link>
          ))}
        </nav>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{translate(locale, "admin.projects")}</h2>
          <Link href="/projects/new" className="underline text-sm">
            {translate(locale, "admin.newProject")}
          </Link>
        </div>
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-4 py-1">{translate(locale, "issueCategories.name")}</th>
              <th className="pr-4 py-1">{translate(locale, "project.identifier")}</th>
              <th className="pr-4 py-1">{translate(locale, "admin.colParent")}</th>
              <th className="pr-4 py-1">{translate(locale, "admin.colStatus")}</th>
              <th className="pr-4 py-1">{translate(locale, "admin.colPublic")}</th>
              <th className="pr-4 py-1" />
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b">
                <td className="pr-4 py-1">
                  <Link href={`/projects/${project.identifier}`} className="hover:underline">
                    {project.name}
                  </Link>
                </td>
                <td className="pr-4 py-1">{project.identifier}</td>
                <td className="pr-4 py-1">{project.parentId ? (projectsById.get(project.parentId)?.name ?? "-") : "-"}</td>
                <td className="pr-4 py-1">{STATUS_LABEL[project.status] ? translate(locale, STATUS_LABEL[project.status]) : project.status}</td>
                <td className="pr-4 py-1">{project.isPublic ? translate(locale, "project.isPublic") : translate(locale, "admin.private")}</td>
                <td className="pr-4 py-1">
                  <span className="flex gap-3">
                    {/* Redmine's Admin::ProjectsController offers archive/unarchive here and
                        nowhere else — both are require_admin, unlike close/reopen. */}
                    <ProjectStatusButton
                      projectIdentifier={project.identifier}
                      transition={project.status === "archived" ? "unarchive" : "archive"}
                      locale={locale}
                    />
                    {/* An archived project's own pages 404 for everyone, so this list is the
                        only place one can be deleted — same as Redmine's admin list. */}
                    <DeleteProjectForm projectIdentifier={project.identifier} locale={locale} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
