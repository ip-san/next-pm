import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { listGlobalActivity, type GlobalActivityEvent } from "@/application/activity/list-global-activity";
import { getOrCreateAtomKey } from "@/application/auth/get-or-create-atom-key";
import { ACTIVITY_EVENT_GROUPS, activityEventPath, type ActivityEvent, type ActivityEventGroup } from "@/domain/activity/entity";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { isActiveUser } from "@/domain/user/entity";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { activityRepositories, resolveGlobalActivityProjects } from "@/interface/http/activity-scope";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { userVisibilityFor } from "@/interface/http/user-visibility";

export const dynamic = "force-dynamic";

const GROUP_LABEL: Record<ActivityEventGroup, MessageKey> = {
  issue: "projectMenu.issues",
  news: "projectMenu.news",
  message: "projectMenu.boards",
  wiki_edit: "projectMenu.wiki",
  document: "projectMenu.documents",
  time_entry: "projectMenu.timeEntries",
  changeset: "projectMenu.repository",
};

const TYPE_LABEL: Record<ActivityEvent["type"], MessageKey> = {
  issue_created: "activity.issueCreated",
  issue_updated: "activity.issueUpdated",
  news: "projectMenu.news",
  message: "projectMenu.boards",
  wiki_edit: "activity.wikiEdit",
  document: "projectMenu.documents",
  time_entry: "projectMenu.timeEntries",
  changeset: "activity.changeset",
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * `ActivitiesController#index` without a project: the same date window, the same
 * `show_<type>` checkboxes and the same per-project rules as the project page, aggregated
 * over every project the viewer may see. `?user_id=` narrows to one person's events, which
 * is the link the My Page activity block and a user profile point at.
 */
export default async function GlobalActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; user_id?: string } & Partial<Record<`show_${ActivityEventGroup}`, string>>>;
}) {
  const locale = await currentLocale();
  const rawSearchParams = await searchParams;
  const { from: fromParam, user_id: userIdParam } = rawSearchParams;

  const user = await currentUserFromCookies();
  const userRepository = new DrizzleUserRepository();
  const [projects, atomKey, settings] = await Promise.all([
    resolveGlobalActivityProjects(user),
    user ? getOrCreateAtomKey(userRepository, user.id) : Promise.resolve(null),
    new DrizzleSettingsRepository().getAll(),
  ]);
  const { activityDaysDefault: DAYS } = resolveGeneralSettings(settings);

  // Redmine's `User.visible.active.find(params[:user_id])` — an unknown, locked or invisible id
  // is a 404 there; here it simply drops the filter rather than hiding the whole page. An
  // invisible user gets the same treatment as an unknown one, so the page can't be used to
  // tell the two apart.
  const author = userIdParam ? await userRepository.findById(userIdParam) : null;
  const canSeeAuthor = author ? (await userVisibilityFor(user))(author.id) : false;
  const authorFilter = author && isActiveUser(author) && canSeeAuthor ? author : null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateTo = fromParam ? (parseDateParam(fromParam) ?? today) : today;
  const to = new Date(dateTo);
  to.setUTCDate(to.getUTCDate() + 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - DAYS);

  const anyGroupParamPresent = ACTIVITY_EVENT_GROUPS.some((group) => rawSearchParams[`show_${group}`] !== undefined);
  const selectedGroups = anyGroupParamPresent ? ACTIVITY_EVENT_GROUPS.filter((group) => rawSearchParams[`show_${group}`] !== undefined) : undefined;

  const events = await listGlobalActivity(activityRepositories(), {
    projects,
    userId: user?.id ?? null,
    from,
    to,
    groups: selectedGroups,
    authorId: authorFilter?.id ?? null,
  });

  const authors = await userRepository.findByIds([...new Set(events.map((e) => e.authorId).filter((id): id is string => id !== null))]);
  const authorById = new Map(authors.map((a) => [a.id, `${a.lastname} ${a.firstname}`]));

  const eventsByDay = new Map<string, GlobalActivityEvent[]>();
  for (const event of events) {
    const day = formatDate(event.occurredAt);
    const list = eventsByDay.get(day) ?? [];
    list.push(event);
    eventsByDay.set(day, list);
  }

  const prevFrom = new Date(from);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - 1);
  // The next window's `from` lands on `to + DAYS - 1` so it starts exactly where this one
  // ends (Redmine's `@date_to + @days - 1`).
  const nextFrom = new Date(to);
  nextFrom.setUTCDate(nextFrom.getUTCDate() + DAYS - 1);
  const carried = `${selectedGroups ? selectedGroups.map((group) => `&show_${group}=1`).join("") : ""}${authorFilter ? `&user_id=${authorFilter.id}` : ""}`;

  const feedQuery = new URLSearchParams();
  if (atomKey) feedQuery.set("key", atomKey);
  if (authorFilter) feedQuery.set("user_id", authorFilter.id);
  for (const group of selectedGroups ?? []) feedQuery.append(`show_${group}`, "1");

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {authorFilter ? interpolate(translate(locale, "activity.userTitle"), { name: `${authorFilter.lastname} ${authorFilter.firstname}` }) : translate(locale, "activity.allTitle")}
        </h1>
        <a href={`/api/activity/atom?${feedQuery.toString()}`} className="text-sm underline">
          Atom
        </a>
      </div>

      <form className="flex flex-wrap gap-4 items-center text-sm">
        {ACTIVITY_EVENT_GROUPS.map((group) => (
          <label key={group} className="flex items-center gap-1">
            <input type="checkbox" name={`show_${group}`} value="1" defaultChecked={!selectedGroups || selectedGroups.includes(group)} />
            {translate(locale, GROUP_LABEL[group])}
          </label>
        ))}
        {authorFilter ? <input type="hidden" name="user_id" value={authorFilter.id} /> : null}
        <input type="hidden" name="from" value={fromParam ?? ""} />
        <button type="submit" className="bg-black text-white rounded px-3 py-1">
          {translate(locale, "query.apply")}
        </button>
      </form>

      <p className="text-sm text-gray-600">
        {formatDate(from)} 〜 {formatDate(dateTo)}
        {" ・ "}
        <Link href={`?from=${formatDate(prevFrom)}${carried}`} className="underline">
          {interpolate(translate(locale, "activity.prevDays"), { days: DAYS })}
        </Link>
        {to <= today ? (
          <>
            {" | "}
            <Link href={`?from=${formatDate(nextFrom)}${carried}`} className="underline">
              {interpolate(translate(locale, "activity.nextDays"), { days: DAYS })}
            </Link>
          </>
        ) : null}
        {authorFilter ? (
          <>
            {" ・ "}
            <Link href={`?from=${fromParam ?? ""}`} className="underline">
              {translate(locale, "activity.allUsers")}
            </Link>
          </>
        ) : null}
      </p>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">{translate(locale, "activity.none")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {[...eventsByDay.entries()].map(([day, dayEvents]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="font-semibold text-sm border-b pb-1">{day}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {dayEvents.map((event) => (
                  <li key={`${event.projectIdentifier}-${event.type}-${event.id}-${event.occurredAt.toISOString()}`} className="border rounded p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{event.projectName}</span>
                      <span>{translate(locale, TYPE_LABEL[event.type])}</span>
                      <span>{event.occurredAt.toISOString()}</span>
                      {event.authorId ? <span>{authorById.get(event.authorId) ?? "?"}</span> : null}
                    </div>
                    <Link href={activityEventPath(event.projectIdentifier, event)} className="font-medium underline block">
                      {event.title}
                    </Link>
                    {event.excerpt ? <p className="text-gray-600 line-clamp-2">{event.excerpt}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
