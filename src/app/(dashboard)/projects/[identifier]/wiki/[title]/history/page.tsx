import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export default async function WikiHistoryPage({
  params,
}: {
  params: Promise<{ identifier: string; title: string }>;
}) {
  const locale = await currentLocale();
  const { identifier, title: rawTitle } = await params;
  const title = decodeURIComponent(rawTitle);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  // Redmine maps wiki#history/diff/annotate to view_wiki_edits, not view_wiki_pages
  // (preparation.rb#L125) — seeing a page does not imply seeing who changed it.
  if (!can({ permission: "view_wiki_edits", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const resolved = await resolveWikiPage(
    { wikiPageRepository: new DrizzleWikiPageRepository(), wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (!resolved) {
    notFound();
  }
  if (resolved.redirected) {
    redirect(`/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}/history`);
  }
  const wikiPage = resolved.page;
  const versions = await new DrizzleWikiContentRepository().listVersions(wikiPage.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "wiki.historyTitle"), { title })}</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {versions.map((version, index) => (
          <li key={version.id} className="border rounded p-2 flex items-center justify-between">
            <span>
              {interpolate(translate(locale, "wiki.version"), { version: version.version })} · {version.createdAt.toISOString()}
              {version.comments ? ` — ${version.comments}` : ""}
            </span>
            <span className="flex items-center gap-3">
              <Link
                href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/annotate?version=${version.version}`}
                className="underline"
              >
                {translate(locale, "wiki.annotate")}
              </Link>
              {index + 1 < versions.length ? (
                <Link
                  href={`/projects/${identifier}/wiki/${encodeURIComponent(title)}/diff?from=${versions[index + 1].version}&to=${version.version}`}
                  className="underline"
                >
                  {translate(locale, "wiki.diffPrevious")}
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
