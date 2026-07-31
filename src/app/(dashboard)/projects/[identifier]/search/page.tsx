import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { SearchResult } from "@/domain/search/entity";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

/**
 * Searches each entity type with its own permission gate rather than one merged query —
 * every type has a different view_* permission, and Message additionally has no project_id
 * of its own (it only reaches a project through its board), so a single UNION would either
 * mis-scope messages or need a fragile ad-hoc join. See domain repositories' search() methods.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { identifier } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);

  const results: SearchResult[] = [];

  if (query.length > 0) {
    if (can({ permission: "view_issues", project: projectContext, actor })) {
      const issues = await new DrizzleIssueRepository().search(project.id, query);
      const visibleIssues = issues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, issuesVisibilityRoles(actor)));
      results.push(...visibleIssues.map((issue) => ({ type: "issue" as const, id: issue.id, title: issue.subject, excerpt: issue.description })));
    }

    if (can({ permission: "view_wiki_pages", project: projectContext, actor })) {
      const hits = await new DrizzleWikiContentRepository().search(project.id, query);
      results.push(...hits.map((hit) => ({ type: "wiki_page" as const, id: hit.page.title, title: hit.page.title, excerpt: hit.currentVersion.text })));
    }

    if (can({ permission: "view_news", project: projectContext, actor })) {
      const newsItems = await new DrizzleNewsRepository().search(project.id, query);
      results.push(...newsItems.map((item) => ({ type: "news" as const, id: item.id, title: item.title, excerpt: item.description })));
    }

    if (can({ permission: "view_messages", project: projectContext, actor })) {
      const messages = await new DrizzleMessageRepository().search(project.id, query);
      results.push(...messages.map((message) => ({ type: "message" as const, id: message.id, title: message.subject, excerpt: message.content })));
    }
  }

  const urlFor = (result: SearchResult): string => {
    switch (result.type) {
      case "issue":
        return `/projects/${identifier}/issues/${result.id}`;
      case "wiki_page":
        return `/projects/${identifier}/wiki/${encodeURIComponent(result.id)}`;
      case "news":
        return `/projects/${identifier}/news/${result.id}`;
      case "message":
        return `/projects/${identifier}/boards`;
    }
  };

  const TYPE_LABEL: Record<SearchResult["type"], string> = {
    issue: "チケット",
    wiki_page: "Wiki",
    news: "ニュース",
    message: "フォーラム",
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">検索</h1>
      <form className="flex gap-2 max-w-md">
        <input name="q" defaultValue={query} placeholder="検索語" className="border rounded px-3 py-2 text-sm flex-1" />
        <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm">
          検索
        </button>
      </form>

      {query.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {results.map((result) => (
            <li key={`${result.type}-${result.id}`} className="border rounded p-3">
              <span className="text-xs text-gray-500">{TYPE_LABEL[result.type]}</span>
              <Link href={urlFor(result)} className="font-medium underline block">
                {result.title}
              </Link>
              <p className="text-gray-600 line-clamp-2">{result.excerpt}</p>
            </li>
          ))}
          {results.length === 0 ? <p className="text-gray-500">該当する結果が見つかりませんでした。</p> : null}
        </ul>
      ) : null}
    </main>
  );
}
