import { NextResponse } from "next/server";
import { activityEventPath } from "@/domain/activity/entity";
import { buildAtomFeed } from "@/domain/atom/build-feed";
import { listProjectActivity } from "@/application/activity/list-project-activity";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

const DAYS = 30;
const FEED_ENTRY_LIMIT = 25;

async function resolveUser(request: Request, url: URL) {
  const viaCookie = await currentUserFromCookies();
  if (viaCookie) return viaCookie;

  // Mirrors Redmine's atom_key (accept_atom_auth): a feed reader can't carry a session cookie
  // or set custom headers, so it authenticates via a token embedded in the feed URL itself.
  // Deliberately NOT the general apiKey — query strings end up in server logs, browser
  // history, and proxy caches, so a leak here must only expose read-only feed content, never
  // the full REST API access apiKey grants. atomKey is a separate, narrowly-scoped token.
  const key = url.searchParams.get("key");
  if (!key) return null;
  return new DrizzleUserRepository().findByAtomKey(key);
}

// Mirrors ActivitiesController#index format.atom. Scope: always the last 30 days across every
// event type (no per-type show_* filtering, no date navigation) — a feed reader polls this
// URL unattended, so there's no per-request UI state to carry the way the HTML page has.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveUser(request, url);
  const { actor, userGroupIds } = await resolveActor(user, project.id);

  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - DAYS);

  const events = await listProjectActivity(
    {
      issueRepository: new DrizzleIssueRepository(),
      journalRepository: new DrizzleJournalRepository(),
      newsRepository: new DrizzleNewsRepository(),
      messageRepository: new DrizzleMessageRepository(),
      wikiContentRepository: new DrizzleWikiContentRepository(),
      documentRepository: new DrizzleDocumentRepository(),
      timeEntryRepository: new DrizzleTimeEntryRepository(),
    },
    {
      projectId: project.id,
      projectContext: toAuthorizationProject(project),
      actor,
      userId: user?.id ?? null,
      userGroupIds,
      issueVisibilityRoles: issuesVisibilityRoles(actor),
      from,
      to,
    },
  );

  const limited = events.slice(0, FEED_ENTRY_LIMIT);
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

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      // The feed URL carries the reader's atomKey in its query string — never send it as a
      // Referer header if a feed reader follows a link out from this response.
      "Referrer-Policy": "no-referrer",
    },
  });
}
