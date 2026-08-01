import Link from "next/link";
import { notFound } from "next/navigation";
import { isArchivedProject, type Project } from "@/domain/project/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { ProjectArchiveButtons } from "./project-archive-buttons";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<Project["status"], string> = {
  active: "有効",
  closed: "クローズ",
  archived: "アーカイブ済み",
};

/** Tree depth per project, from the lft-ordered nested set (an ancestor's rgt encloses its subtree). */
function depthByProject(projectsInLftOrder: Project[]): Map<string, number> {
  const depths = new Map<string, number>();
  const ancestorStack: Project[] = [];
  for (const project of projectsInLftOrder) {
    while (ancestorStack.length > 0 && ancestorStack[ancestorStack.length - 1].rgt < project.rgt) {
      ancestorStack.pop();
    }
    depths.set(project.id, ancestorStack.length);
    ancestorStack.push(project);
  }
  return depths;
}

/**
 * Redmine's admin projects list — the only place archived projects appear at all
 * (the authorization service denies every permission on them, project pages included),
 * and therefore the only way back out of the archived state.
 */
export default async function AdminProjectsPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const projects = await new DrizzleProjectRepository().listAll();
  const depths = depthByProject(projects);

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">プロジェクト</h1>
        <div className="flex gap-3">
          <Link href="/admin/users" className="underline text-sm">
            ユーザー
          </Link>
          <Link href="/projects/new" className="underline text-sm">
            新しいプロジェクト
          </Link>
        </div>
      </div>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">名称</th>
            <th className="pr-4 py-1">識別子</th>
            <th className="pr-4 py-1">公開</th>
            <th className="pr-4 py-1">ステータス</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-b">
              <td className="pr-4 py-1" style={{ paddingLeft: `${depths.get(project.id)! * 1.25}rem` }}>
                {isArchivedProject(project) ? (
                  // No link — an archived project's pages deny access for everyone.
                  <span className="text-gray-500">{project.name}</span>
                ) : (
                  <Link href={`/projects/${project.identifier}`} className="underline">
                    {project.name}
                  </Link>
                )}
              </td>
              <td className="pr-4 py-1">{project.identifier}</td>
              <td className="pr-4 py-1">{project.isPublic ? "公開" : "非公開"}</td>
              <td className="pr-4 py-1">{STATUS_LABELS[project.status]}</td>
              <td className="pr-4 py-1">
                <ProjectArchiveButtons projectId={project.id} isArchived={isArchivedProject(project)} />
              </td>
            </tr>
          ))}
          {projects.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-gray-400 py-2">
                プロジェクトはありません。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
