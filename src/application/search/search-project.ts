import { can } from "@/domain/authorization/authorization-service";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssueRepository } from "@/domain/issue/repository";
import type { IssuesVisibility } from "@/domain/role/entity";
import type { MessageRepository } from "@/domain/message/repository";
import type { NewsRepository } from "@/domain/news/repository";
import type { SearchCriteria, SearchResult, SearchResultType } from "@/domain/search/entity";
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
  userGroupIds: string[];
  issueVisibilityRoles: { issuesVisibility: IssuesVisibility }[];
  /** What to look for and how — already tokenized by the caller. */
  criteria: SearchCriteria;
  /** Which object types to search. Redmine's unchecked-everything case means "all of them". */
  types: SearchResultType[];
  /** Redmine's `open_issues` checkbox; only the issue search looks at it. */
  openIssues: boolean;
}

/**
 * Searches each entity type with its own permission gate rather than one merged query —
 * every type has a different view_* permission, and Message additionally has no project_id
 * of its own (it only reaches a project through its board), so a single UNION would either
 * mis-scope messages or need a fragile ad-hoc join. Shared between the search page and its
 * REST route so the two never drift on which types are gated by which permission.
 */
export async function searchProject(repositories: SearchProjectRepositories, input: SearchProjectInput): Promise<SearchResult[]> {
  if (input.criteria.tokens.length === 0) {
    return [];
  }

  const projectIds = [input.projectId];
  const wants = (type: SearchResultType) => input.types.includes(type);
  const results: SearchResult[] = [];

  if (wants("issue") && can({ permission: "view_issues", project: input.projectContext, actor: input.actor })) {
    const issues = await repositories.issueRepository.search(projectIds, { ...input.criteria, openIssues: input.openIssues });
    const visibleIssues = issues.filter((issue) => isPrivateIssueVisible(issue, input.userId, input.userGroupIds, input.issueVisibilityRoles));
    results.push(
      ...visibleIssues.map((issue) => ({
        type: "issue" as const,
        id: issue.id,
        title: issue.subject,
        excerpt: issue.description,
        occurredAt: issue.createdAt,
      })),
    );
  }

  if (wants("wiki_page") && can({ permission: "view_wiki_pages", project: input.projectContext, actor: input.actor })) {
    const hits = await repositories.wikiContentRepository.search(projectIds, input.criteria);
    results.push(
      ...hits.map((hit) => ({
        type: "wiki_page" as const,
        id: hit.page.title,
        title: hit.page.title,
        excerpt: hit.currentVersion.text,
        occurredAt: hit.currentVersion.createdAt,
      })),
    );
  }

  if (wants("news") && can({ permission: "view_news", project: input.projectContext, actor: input.actor })) {
    const newsItems = await repositories.newsRepository.search(projectIds, input.criteria);
    results.push(
      ...newsItems.map((item) => ({
        type: "news" as const,
        id: item.id,
        title: item.title,
        excerpt: item.description,
        occurredAt: item.createdAt,
      })),
    );
  }

  if (wants("message") && can({ permission: "view_messages", project: input.projectContext, actor: input.actor })) {
    const messages = await repositories.messageRepository.search(projectIds, input.criteria);
    results.push(
      ...messages.map((message) => ({
        type: "message" as const,
        id: message.id,
        title: message.subject,
        excerpt: message.content,
        occurredAt: message.createdAt,
      })),
    );
  }

  return results;
}
