import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import type { SearchResultType } from "@/domain/search/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { SearchOptionsForm, SEARCH_TYPE_LABEL } from "@/interface/components/search/search-options-form";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { runSearch, type SearchHit } from "@/interface/http/run-search";
import { parseSearchRequest, resolveSearchProjects, SEARCH_RESULTS_PER_PAGE } from "@/interface/http/search-params";

export const dynamic = "force-dynamic";

function resultHref({ project, result }: SearchHit): string {
  switch (result.type) {
    case "issue":
      return `/projects/${project.identifier}/issues/${result.id}`;
    case "wiki_page":
      return `/projects/${project.identifier}/wiki/${encodeURIComponent(result.id)}`;
    case "news":
      return `/projects/${project.identifier}/news/${result.id}`;
    case "message":
      return `/projects/${project.identifier}/boards`;
  }
}

/**
 * `SearchController#index` with a project: the same options as the global page, plus the
 * two project-relative scopes. The default scope is this project alone.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) urlParams.append(key, entry);
  }
  const request = parseSearchRequest(urlParams, "project");

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "search_project", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const projects = await resolveSearchProjects(user, request.scope, project);
  const run = await runSearch(projects, request, { userId: user?.id ?? null }, SEARCH_RESULTS_PER_PAGE);

  const pageHref = (page: number) => {
    const next = new URLSearchParams(urlParams);
    next.set("page", String(page));
    return `/projects/${identifier}/search?${next.toString()}`;
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "search.title"), { project: project.name })}</h1>
        <Link href={`/search?q=${encodeURIComponent(request.question)}`} className="text-sm underline">
          {translate(locale, "search.allProjects")}
        </Link>
      </div>

      <SearchOptionsForm request={request} scopes={["project", "subprojects", "my_projects", "all"]} counts={run.countsByType} />

      {request.question.length > 0 && request.criteria.tokens.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "search.minLength")}</p>
      ) : null}

      {request.criteria.tokens.length > 0 ? (
        <>
          <p className="text-sm text-gray-600">{interpolate(translate(locale, "search.count"), { count: run.totalCount })}</p>
          <ul className="flex flex-col gap-2 text-sm">
            {run.hits.map((hit) => (
              <li key={`${hit.project.identifier}-${hit.result.type}-${hit.result.id}`} className="border rounded p-3">
                <span className="text-xs text-gray-500">
                  {hit.project.name} / {SEARCH_TYPE_LABEL[hit.result.type as SearchResultType]}
                </span>
                <Link href={resultHref(hit)} className="font-medium underline block">
                  {hit.result.title}
                </Link>
                <p className="text-gray-600 line-clamp-2">{hit.result.excerpt}</p>
              </li>
            ))}
            {run.hits.length === 0 ? <p className="text-gray-500">{translate(locale, "search.noResults")}</p> : null}
          </ul>

          {run.pageCount > 1 ? (
            <nav className="flex items-center gap-3 text-sm" aria-label={translate(locale, "query.pagination")}>
              {Array.from({ length: run.pageCount }, (_, index) => index + 1).map((page) => (
                <Link key={page} href={pageHref(page)} className={page === request.page ? "font-semibold" : "underline"}>
                  {page}
                </Link>
              ))}
            </nav>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
