import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import type { SearchResultType } from "@/domain/search/entity";
import { SearchOptionsForm, SEARCH_TYPE_LABEL } from "@/interface/components/search/search-options-form";
import { currentUserFromCookies } from "@/interface/http/current-user";
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
 * `SearchController#index` with no project: scope radio, per-type checkboxes, titles_only,
 * all_words, open_issues and the attachments mode, all carried in the query string.
 */
export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await currentLocale();
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    // Each checkbox submits its hidden "" alongside the ticked "1"; the last value wins,
    // which is exactly how a browser form and Rails' params agree on the answer.
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  const request = parseSearchRequest(params, "all");

  const user = await currentUserFromCookies();
  const projects = await resolveSearchProjects(user, request.scope, null);
  const run = await runSearch(projects, request, { userId: user?.id ?? null }, SEARCH_RESULTS_PER_PAGE);

  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `/search?${next.toString()}`;
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "search.allTitle")}</h1>

      <SearchOptionsForm request={request} scopes={["all", "my_projects"]} counts={run.countsByType} />

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
