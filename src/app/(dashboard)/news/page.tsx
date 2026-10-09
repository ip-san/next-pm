import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectsWithPermission } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

/**
 * Cross-project news, mirroring NewsController#index without a project: the scope is
 * `News.visible` (every project where the viewer holds view_news) ordered by created_on DESC.
 * Redmine's HTML index shows 10 at a time; the same limit keeps this a digest rather than a
 * full archive, and each project's own /projects/:id/news stays the complete list.
 */
const LIMIT = 10;

export default async function GlobalNewsPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  const projects = await listProjectsWithPermission(user, "view_news");
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const newsRepository = new DrizzleNewsRepository();
  const items = (await Promise.all(projects.map((project) => newsRepository.listByProject(project.id))))
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, LIMIT);

  const authors = await new DrizzleUserRepository().findByIds([...new Set(items.map((item) => item.authorId))]);
  const authorLabelById = new Map(authors.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "projectMenu.news")}</h1>
      {items.length === 0 ? (
        <p className="text-gray-400 text-xs">{translate(locale, "news.noneVisible")}</p>
      ) : (
        <ul className="flex flex-col gap-3 text-sm">
          {items.map((item) => {
            const project = projectById.get(item.projectId);
            return (
              <li key={item.id} className="border rounded p-3">
                <Link href={`/projects/${project?.identifier ?? ""}/news/${item.id}`} className="font-medium underline">
                  {item.title}
                </Link>
                <p className="text-gray-500 text-xs">
                  {project?.name ?? ""} · {authorLabelById.get(item.authorId) ?? ""} · {item.createdAt.toISOString()}
                </p>
                {item.summary ? <p className="text-gray-600">{item.summary}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
