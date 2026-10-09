import { UserAvatar } from "@/interface/components/user-avatar";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTIVITY_EVENT_GROUPS, activityEventPath, type ActivityEvent, type ActivityEventGroup } from "@/domain/activity/entity";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { getOrCreateAtomKey } from "@/application/auth/get-or-create-atom-key";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listProjectActivityFeed } from "@/interface/http/project-activity-feed";
import { resolveActor } from "@/interface/http/resolve-actor";

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

export default async function ProjectActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ from?: string } & Partial<Record<`show_${ActivityEventGroup}`, string>>>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const rawSearchParams = await searchParams;
  const { from: fromParam } = rawSearchParams;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const atomKey = user ? await getOrCreateAtomKey(new DrizzleUserRepository(), user.id) : null;
  const { activityDaysDefault: DAYS } = resolveGeneralSettings(await new DrizzleSettingsRepository().getAll());

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateTo = fromParam ? (parseDateParam(fromParam) ?? today) : today;
  const to = new Date(dateTo);
  to.setUTCDate(to.getUTCDate() + 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - DAYS);

  // Mirrors Redmine's ActivitiesController: each type is its own `show_<type>` checkbox, so an
  // unconstrained first visit (no `show_*` param at all) and "every box explicitly checked" are
  // indistinguishable from "nothing checked" — both read as "no filter", i.e. show everything.
  const anyGroupParamPresent = ACTIVITY_EVENT_GROUPS.some((group) => rawSearchParams[`show_${group}`] !== undefined);
  const selectedGroups = anyGroupParamPresent ? ACTIVITY_EVENT_GROUPS.filter((group) => rawSearchParams[`show_${group}`] !== undefined) : undefined;

  const feed = await listProjectActivityFeed({ user, project, actor, userGroupIds, from, to, groups: selectedGroups });
  const events = feed.map((entry) => entry.event);
  const identifierOf = new Map(feed.map((entry) => [entry.event, entry.identifier]));

  const authors = await new DrizzleUserRepository().findByIds([...new Set(events.map((e) => e.authorId).filter((id): id is string => id !== null))]);
  const authorById = new Map(authors.map((a) => [a.id, `${a.lastname} ${a.firstname}`]));
  const authorMailById = new Map(authors.map((a) => [a.id, a.mail]));
  const { gravatarEnabled } = await loadAuthSettings(new DrizzleSettingsRepository());

  const eventsByDay = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const day = formatDate(event.occurredAt);
    const list = eventsByDay.get(day) ?? [];
    list.push(event);
    eventsByDay.set(day, list);
  }

  const prevFrom = new Date(from);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - 1);
  // Next window's "from" param must land on `to + DAYS - 1` so the resulting window starts
  // exactly where this one ends (mirrors Redmine's `@date_to + @days - 1`) — reusing `to`
  // itself here would always jump back to "today", skipping every day in between.
  const nextFrom = new Date(to);
  nextFrom.setUTCDate(nextFrom.getUTCDate() + DAYS - 1);
  const showParam = selectedGroups ? selectedGroups.map((group) => `&show_${group}=1`).join("") : "";

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "activity.title"), { project: project.name })}</h1>
        <a
          href={`/api/projects/${identifier}/activity/atom${atomKey ? `?key=${atomKey}` : ""}`}
          className="text-sm underline"
        >
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
        <input type="hidden" name="from" value={fromParam ?? ""} />
        <button type="submit" className="bg-black text-white rounded px-3 py-1">
          {translate(locale, "query.apply")}
        </button>
      </form>

      <p className="text-sm text-gray-600">
        {formatDate(from)} 〜 {formatDate(dateTo)}
        {" ・ "}
        <Link href={`?from=${formatDate(prevFrom)}${showParam}`} className="underline">
          {interpolate(translate(locale, "activity.prevDays"), { days: DAYS })}
        </Link>
        {to <= today ? (
          <>
            {" | "}
            <Link href={`?from=${formatDate(nextFrom)}${showParam}`} className="underline">
              {interpolate(translate(locale, "activity.nextDays"), { days: DAYS })}
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
                  <li key={`${event.type}-${event.id}-${event.occurredAt.toISOString()}`} className="border rounded p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{translate(locale, TYPE_LABEL[event.type])}</span>
                      <span>{event.occurredAt.toISOString()}</span>
                      {event.authorId ? (
                        <span className="inline-flex items-center gap-1">
                          <UserAvatar mail={authorMailById.get(event.authorId) ?? null} gravatarEnabled={gravatarEnabled} />
                          {authorById.get(event.authorId) ?? "?"}
                        </span>
                      ) : null}
                    </div>
                    <Link href={activityEventPath(identifierOf.get(event) ?? identifier, event)} className="font-medium underline block">
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
