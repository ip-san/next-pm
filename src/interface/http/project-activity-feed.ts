import type { ActivityEvent, ActivityEventGroup } from "@/domain/activity/entity";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { User } from "@/domain/user/entity";
import { listProjectActivity } from "@/application/activity/list-project-activity";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { subtreeScopes } from "@/domain/project/nested-set";
import { listVisibleProjectContexts, issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";

export interface ProjectActivityFeedInput {
  user: User | null;
  project: Project;
  actor: AuthorizationActor;
  userGroupIds: string[];
  from: Date;
  to: Date;
  groups?: ActivityEventGroup[];
}

export interface ProjectActivityFeedEntry {
  event: ActivityEvent;
  /** The identifier of the project the event belongs to, for its link. */
  identifier: string;
}

/**
 * The project's activity, newest first. With display_subprojects_issues on, the subprojects' events are
 * included too; each project's events come from the same per-project loader, judged with that project's own
 * actor and visibility, so a subproject's private issues are judged the way they are on its own page.
 */
export async function listProjectActivityFeed(input: ProjectActivityFeedInput): Promise<ProjectActivityFeedEntry[]> {
  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const self = { ...(await resolveActor(input.user, input.project.id)), project: input.project, projectContext: toAuthorizationProject(input.project) };
  const scopes = subtreeScopes(displaySubprojectsIssues, await listVisibleProjectContexts(input.user, "view_project"), input.project, self);

  const perProject = await Promise.all(
    scopes.map(async (scope) => {
      const events = await listProjectActivity(
        {
          issueRepository: new DrizzleIssueRepository(),
          journalRepository: new DrizzleJournalRepository(),
          newsRepository: new DrizzleNewsRepository(),
          messageRepository: new DrizzleMessageRepository(),
          wikiContentRepository: new DrizzleWikiContentRepository(),
          documentRepository: new DrizzleDocumentRepository(),
          timeEntryRepository: new DrizzleTimeEntryRepository(),
          scmRepositoryRepository: new DrizzleScmRepositoryRepository(),
          changesetRepository: new DrizzleChangesetRepository(),
        },
        {
          projectId: scope.project.id,
          projectContext: scope.projectContext,
          actor: scope.actor,
          userId: input.user?.id ?? null,
          userGroupIds: scope.userGroupIds,
          issueVisibilityRoles: issuesVisibilityRoles(scope.actor),
          timeEntryVisibilityRoles: timeEntriesVisibilityRoles(scope.actor),
          from: input.from,
          to: input.to,
          groups: input.groups,
        },
      );
      return events.map((event) => ({ event, identifier: scope.project.identifier }));
    }),
  );
  return perProject.flat().sort((a, b) => b.event.occurredAt.getTime() - a.event.occurredAt.getTime());
}
