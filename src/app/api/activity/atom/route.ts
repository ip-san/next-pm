import { listGlobalActivity } from "@/application/activity/list-global-activity";
import { ACTIVITY_EVENT_GROUPS, activityEventPath, type ActivityEventGroup } from "@/domain/activity/entity";
import { buildAtomFeed } from "@/domain/atom/build-feed";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { isActiveUser } from "@/domain/user/entity";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { activityRepositories, resolveGlobalActivityProjects } from "@/interface/http/activity-scope";
import { atomResponse, resolveAtomUser } from "@/interface/http/atom-feed";
import { translate } from "@/domain/i18n/messages";
import { localeForViewer } from "@/interface/http/locale";

export const dynamic = "force-dynamic";

/**
 * `ActivitiesController#index.atom` without a project. Redmine's atom branch asks the
 * Fetcher for `events(nil, nil, :limit => Setting.feeds_limit)` — no date window at all,
 * just the newest N — because a feed reader polls unattended and has no "previous 30 days"
 * control to carry. The `show_*` and `user_id` params are still honoured, so the Atom link
 * next to a filtered page subscribes to that filtering.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await resolveAtomUser(url);
  const userRepository = new DrizzleUserRepository();

  const [projects, settings] = await Promise.all([resolveGlobalActivityProjects(user), new DrizzleSettingsRepository().getAll()]);
  const { feedsLimit } = resolveGeneralSettings(settings);

  const userIdParam = url.searchParams.get("user_id");
  const author = userIdParam ? await userRepository.findById(userIdParam) : null;
  const authorFilter = author && isActiveUser(author) ? author : null;

  const anyGroupParamPresent = ACTIVITY_EVENT_GROUPS.some((group) => url.searchParams.has(`show_${group}`));
  const selectedGroups: ActivityEventGroup[] | undefined = anyGroupParamPresent
    ? ACTIVITY_EVENT_GROUPS.filter((group) => url.searchParams.has(`show_${group}`))
    : undefined;

  // No window: `from` is the epoch so the merge is over everything, then `limit` keeps the
  // newest `feeds_limit` events.
  const events = await listGlobalActivity(activityRepositories(), {
    projects,
    userId: user?.id ?? null,
    from: new Date(0),
    to: new Date(Date.now() + 24 * 60 * 60 * 1000),
    groups: selectedGroups,
    authorId: authorFilter?.id ?? null,
    limit: feedsLimit,
  });

  const authors = await userRepository.findByIds([...new Set(events.map((event) => event.authorId).filter((id): id is string => id !== null))]);
  const authorById = new Map(authors.map((a) => [a.id, `${a.lastname} ${a.firstname}`]));

  const title = authorFilter ? `${authorFilter.lastname} ${authorFilter.firstname}` : translate(await localeForViewer(user), "export.activity");
  const xml = buildAtomFeed(
    { id: `${url.origin}/activity`, title: `next-pm - ${title}`, selfUrl: url.toString() },
    events.map((event) => {
      const link = `${url.origin}${activityEventPath(event.projectIdentifier, event)}`;
      return {
        id: `${link}#${event.type}-${event.id}`,
        title: `${event.projectName}: ${event.title}`,
        link,
        updatedAt: event.occurredAt,
        authorName: event.authorId ? (authorById.get(event.authorId) ?? null) : null,
        summary: event.excerpt,
      };
    }),
  );

  return atomResponse(xml);
}
