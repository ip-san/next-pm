import type { GlobalActivityProject } from "@/application/activity/list-global-activity";
import type { ListProjectActivityRepositories } from "@/application/activity/list-project-activity";
import type { User } from "@/domain/user/entity";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { issuesVisibilityRoles, listVisibleProjectContexts } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";

/** The nine repositories the activity aggregation reads — one per event provider. */
export function activityRepositories(): ListProjectActivityRepositories {
  return {
    issueRepository: new DrizzleIssueRepository(),
    journalRepository: new DrizzleJournalRepository(),
    newsRepository: new DrizzleNewsRepository(),
    messageRepository: new DrizzleMessageRepository(),
    wikiContentRepository: new DrizzleWikiContentRepository(),
    documentRepository: new DrizzleDocumentRepository(),
    timeEntryRepository: new DrizzleTimeEntryRepository(),
    scmRepositoryRepository: new DrizzleScmRepositoryRepository(),
    changesetRepository: new DrizzleChangesetRepository(),
  };
}

/**
 * Every project whose activity `user` may read, with the per-project rules resolved.
 * `view_project` is the gate, matching Redmine's `map.permission :view_project, {...,
 * :activities => [:index]}`; each event type is then gated again inside
 * `listProjectActivity` by its own `view_*`.
 */
export async function resolveGlobalActivityProjects(user: User | null): Promise<GlobalActivityProject[]> {
  const visible = await listVisibleProjectContexts(user, "view_project");
  return visible.map((entry) => ({
    projectId: entry.project.id,
    projectIdentifier: entry.project.identifier,
    projectName: entry.project.name,
    projectContext: entry.projectContext,
    actor: entry.actor,
    userGroupIds: entry.userGroupIds,
    issueVisibilityRoles: issuesVisibilityRoles(entry.actor),
    timeEntryVisibilityRoles: timeEntriesVisibilityRoles(entry.actor),
  }));
}
