import { can } from "@/domain/authorization/authorization-service";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssueRepository } from "@/domain/issue/repository";
import type { IssuesVisibility } from "@/domain/role/entity";
import type { MessageRepository } from "@/domain/message/repository";
import type { NewsRepository } from "@/domain/news/repository";
import type { SearchResult } from "@/domain/search/entity";
import type { WikiContentRepository } from "@/domain/wiki/repository";

export interface SearchProjectRepositories {
  issueRepository: IssueRepository;
  wikiContentRepository: WikiContentRepository;
  newsRepository: NewsRepository;
  messageRepository: MessageRepository;
}

export interface SearchProjectInput {
  projectId: string;
  projectContext: ProjectAuthorizationContext;
  actor: AuthorizationActor;
  userId: string | null;
  issueVisibilityRoles: { issuesVisibility: IssuesVisibility }[];
  query: string;
}

/**
 * Searches each entity type with its own permission gate rather than one merged query —
 * every type has a different view_* permission, and Message additionally has no project_id
 * of its own (it only reaches a project through its board), so a single UNION would either
 * mis-scope messages or need a fragile ad-hoc join. Shared between the search page and its
 * REST route so the two never drift on which types are gated by which permission.
 */
export async function searchProject(repositories: SearchProjectRepositories, input: SearchProjectInput): Promise<SearchResult[]> {
  if (input.query.trim().length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  if (can({ permission: "view_issues", project: input.projectContext, actor: input.actor })) {
    const issues = await repositories.issueRepository.search(input.projectId, input.query);
    const visibleIssues = issues.filter((issue) => isPrivateIssueVisible(issue, input.userId, input.issueVisibilityRoles));
    results.push(...visibleIssues.map((issue) => ({ type: "issue" as const, id: issue.id, title: issue.subject, excerpt: issue.description })));
  }

  if (can({ permission: "view_wiki_pages", project: input.projectContext, actor: input.actor })) {
    const hits = await repositories.wikiContentRepository.search(input.projectId, input.query);
    results.push(...hits.map((hit) => ({ type: "wiki_page" as const, id: hit.page.title, title: hit.page.title, excerpt: hit.currentVersion.text })));
  }

  if (can({ permission: "view_news", project: input.projectContext, actor: input.actor })) {
    const newsItems = await repositories.newsRepository.search(input.projectId, input.query);
    results.push(...newsItems.map((item) => ({ type: "news" as const, id: item.id, title: item.title, excerpt: item.description })));
  }

  if (can({ permission: "view_messages", project: input.projectContext, actor: input.actor })) {
    const messages = await repositories.messageRepository.search(input.projectId, input.query);
    results.push(...messages.map((message) => ({ type: "message" as const, id: message.id, title: message.subject, excerpt: message.content })));
  }

  return results;
}
