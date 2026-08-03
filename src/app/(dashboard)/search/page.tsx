import Link from "next/link";
import { can } from "@/domain/authorization/authorization-service";
import type { SearchResult } from "@/domain/search/entity";
import { searchProject } from "@/application/search/search-project";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

interface ProjectSearchResult {
  project: { identifier: string; name: string };
  result: SearchResult;
}

// Mirrors Redmine's SearchController with scope=all: every project the current user may view
// is searched independently — resolveActor and the per-type view_* gate must run per project
// (a project's own role/module grants don't carry over to any other project), so this can't be
// hoisted into one shared actor/permission check the way a single-project search can.
async function searchAllProjects(user: Awaited<ReturnType<typeof currentUserFromCookies>>, query: string): Promise<ProjectSearchResult[]> {
  if (query.trim().length === 0) {
    return [];
  }

  const allProjects = await new DrizzleProjectRepository().listAll();
  const repositories = {
    issueRepository: new DrizzleIssueRepository(),
    wikiContentRepository: new DrizzleWikiContentRepository(),
    newsRepository: new DrizzleNewsRepository(),
    messageRepository: new DrizzleMessageRepository(),
  };

  const hits: ProjectSearchResult[] = [];
  for (const project of allProjects) {
    const { actor, userGroupIds } = await resolveActor(user, project.id);
    const projectContext = toAuthorizationProject(project);
    if (!can({ permission: "view_project", project: projectContext, actor })) {
      continue;
    }

    const results = await searchProject(repositories, {
      projectId: project.id,
      projectContext,
      actor,
      userId: user?.id ?? null,
      userGroupIds,
      issueVisibilityRoles: issuesVisibilityRoles(actor),
      query,
    });

    for (const result of results) {
      hits.push({ project: { identifier: project.identifier, name: project.name }, result });
    }
  }

  return hits;
}

export default async function GlobalSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const user = await currentUserFromCookies();
  const hits = await searchAllProjects(user, query);

  const urlFor = ({ project, result }: ProjectSearchResult): string => {
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
  };

  const TYPE_LABEL: Record<SearchResult["type"], string> = {
    issue: "チケット",
    wiki_page: "Wiki",
    news: "ニュース",
    message: "フォーラム",
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">検索（全プロジェクト）</h1>
      <form className="flex gap-2 max-w-md">
        <input name="q" defaultValue={query} placeholder="検索語" className="border rounded px-3 py-2 text-sm flex-1" />
        <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm">
          検索
        </button>
      </form>

      {query.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {hits.map((hit) => (
            <li key={`${hit.project.identifier}-${hit.result.type}-${hit.result.id}`} className="border rounded p-3">
              <span className="text-xs text-gray-500">
                {hit.project.name} / {TYPE_LABEL[hit.result.type]}
              </span>
              <Link href={urlFor(hit)} className="font-medium underline block">
                {hit.result.title}
              </Link>
              <p className="text-gray-600 line-clamp-2">{hit.result.excerpt}</p>
            </li>
          ))}
          {hits.length === 0 ? <p className="text-gray-500">該当する結果が見つかりませんでした。</p> : null}
        </ul>
      ) : null}
    </main>
  );
}
