import { NextResponse } from "next/server";
import { activityEventPath } from "@/domain/activity/entity";
import { buildAtomFeed } from "@/domain/atom/build-feed";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { listProjectActivity } from "@/application/activity/list-project-activity";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { atomResponse, resolveAtomUser } from "@/interface/http/atom-feed";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";

export const dynamic = "force-dynamic";

// Mirrors ActivitiesController#index format.atom. Scope: always the last activity_days_default
// days across every event type (no per-type show_* filtering, no date navigation) — a feed
// reader polls this URL unattended, so there's no per-request UI state to carry the way the
// HTML page has.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveAtomUser(url);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const { activityDaysDefault, feedsLimit } = resolveGeneralSettings(await new DrizzleSettingsRepository().getAll());

  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - activityDaysDefault);

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
      projectId: project.id,
      projectContext: toAuthorizationProject(project),
      actor,
      userId: user?.id ?? null,
      userGroupIds,
      issueVisibilityRoles: issuesVisibilityRoles(actor),
      timeEntryVisibilityRoles: timeEntriesVisibilityRoles(actor),
      from,
      to,
    },
  );

  const limited = events.slice(0, feedsLimit);
  const authorIds = [...new Set(limited.map((event) => event.authorId).filter((id): id is string => id !== null))];
  const authors = await new DrizzleUserRepository().findByIds(authorIds);
  const authorById = new Map(authors.map((author) => [author.id, `${author.lastname} ${author.firstname}`]));

  const xml = buildAtomFeed(
    { id: `${url.origin}/projects/${identifier}/activity`, title: `${project.name} - アクティビティ`, selfUrl: url.toString() },
    limited.map((event) => ({
      id: `${url.origin}${activityEventPath(identifier, event)}#${event.type}-${event.id}`,
      title: event.title,
      link: `${url.origin}${activityEventPath(identifier, event)}`,
      updatedAt: event.occurredAt,
      authorName: event.authorId ? (authorById.get(event.authorId) ?? null) : null,
      summary: event.excerpt,
    })),
  );

  return atomResponse(xml);
}
