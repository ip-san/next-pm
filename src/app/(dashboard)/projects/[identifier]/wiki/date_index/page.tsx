import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/** Mirrors WikiController#date_index: the same page list, grouped by the day it last changed. */
export default async function WikiDateIndexPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const current = await new DrizzleWikiContentRepository().listCurrentByProject(project.id);
  const byDate = new Map<string, { title: string }[]>();
  for (const { page, version } of [...current].sort((a, b) => b.version.createdAt.getTime() - a.version.createdAt.getTime())) {
    const day = version.createdAt.toISOString().slice(0, 10);
    byDate.set(day, [...(byDate.get(day) ?? []), { title: page.title }]);
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "wiki.dateIndexTitle"), { project: project.name })}</h1>
        <Link href={`/projects/${identifier}/wiki/index`} className="text-sm underline">
          {translate(locale, "wiki.byTitle")}
        </Link>
      </div>
      {byDate.size === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "wiki.noPages")}</p>
      ) : (
        [...byDate.entries()].map(([day, pages]) => (
          <section key={day} className="flex flex-col gap-1">
            <h2 className="font-medium text-sm">{day}</h2>
            <ul className="flex flex-col gap-1 pl-4 list-disc text-sm">
              {pages.map((page) => (
                <li key={page.title}>
                  <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(page.title)}`} className="underline">
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
