import { NextResponse } from "next/server";
import { activityEventPath } from "@/domain/activity/entity";
import { buildAtomFeed } from "@/domain/atom/build-feed";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { listProjectActivityFeed } from "@/interface/http/project-activity-feed";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { atomResponse, resolveAtomUser } from "@/interface/http/atom-feed";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { can } from "@/domain/authorization/authorization-service";

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
  // The feed's *entries* were already filtered by actor, but its title is the project's name,
  // which was being served to anyone who guessed the identifier — a private project's name
  // leaked, and with login_required on the whole feed stayed readable while logged out. The
  // same `view_project` gate the project page uses, and the same 404 rather than 403, so the
  // endpoint does not confirm that the project exists.
  if (!can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { activityDaysDefault, feedsLimit } = resolveGeneralSettings(await new DrizzleSettingsRepository().getAll());

  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - activityDaysDefault);

  const feed = await listProjectActivityFeed({ user, project, actor, userGroupIds, from, to });
  const limited = feed.slice(0, feedsLimit);
  const authorIds = [...new Set(limited.map(({ event }) => event.authorId).filter((id): id is string => id !== null))];
  const authors = await new DrizzleUserRepository().findByIds(authorIds);
  const authorById = new Map(authors.map((author) => [author.id, `${author.lastname} ${author.firstname}`]));

  const xml = buildAtomFeed(
    { id: `${url.origin}/projects/${identifier}/activity`, title: `${project.name} - アクティビティ`, selfUrl: url.toString() },
    limited.map(({ event, identifier: eventIdentifier }) => ({
      id: `${url.origin}${activityEventPath(eventIdentifier, event)}#${event.type}-${event.id}`,
      title: event.title,
      link: `${url.origin}${activityEventPath(eventIdentifier, event)}`,
      updatedAt: event.occurredAt,
      authorName: event.authorId ? (authorById.get(event.authorId) ?? null) : null,
      summary: event.excerpt,
    })),
  );

  return atomResponse(xml);
}
