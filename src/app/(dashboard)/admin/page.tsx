import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { DeleteProjectForm } from "../projects/delete-project-form";
import { ProjectStatusButton } from "../projects/project-status-button";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const ADMIN_SECTIONS = [
  { href: "/admin/users", label: "ユーザー" },
  { href: "/admin/groups", label: "グループ" },
  { href: "/admin/roles", label: "ロールと権限" },
  { href: "/admin/trackers", label: "トラッカー" },
  { href: "/admin/issue-statuses", label: "チケットのステータス" },
  { href: "/admin/workflows", label: "ワークフロー" },
  { href: "/admin/custom-fields", label: "カスタムフィールド" },
  { href: "/admin/enumerations", label: "その他の値" },
  { href: "/admin/settings", label: "設定" },
  { href: "/admin/info", label: "情報" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  active: "有効",
  closed: "終了",
  archived: "アーカイブ済み",
};

export default async function AdminIndexPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const projects = await new DrizzleProjectRepository().listAll();
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  return (
    <main className="p-8 flex flex-col gap-8">
      <h1 className="text-xl font-semibold">管理</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">設定項目</h2>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {ADMIN_SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="hover:underline">
              {section.label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">プロジェクト</h2>
          <Link href="/projects/new" className="underline text-sm">
            新しいプロジェクト
          </Link>
        </div>
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-4 py-1">名前</th>
              <th className="pr-4 py-1">識別子</th>
              <th className="pr-4 py-1">親プロジェクト</th>
              <th className="pr-4 py-1">状態</th>
              <th className="pr-4 py-1">公開</th>
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
                <td className="pr-4 py-1">{STATUS_LABEL[project.status] ?? project.status}</td>
                <td className="pr-4 py-1">{project.isPublic ? "公開" : "非公開"}</td>
                <td className="pr-4 py-1">
                  <span className="flex gap-3">
                    {/* Redmine's Admin::ProjectsController offers archive/unarchive here and
                        nowhere else — both are require_admin, unlike close/reopen. */}
                    <ProjectStatusButton
                      projectIdentifier={project.identifier}
                      transition={project.status === "archived" ? "unarchive" : "archive"}
                    />
                    {/* An archived project's own pages 404 for everyone, so this list is the
                        only place one can be deleted — same as Redmine's admin list. */}
                    <DeleteProjectForm projectIdentifier={project.identifier} />
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
