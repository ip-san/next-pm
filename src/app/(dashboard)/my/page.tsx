import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { currentLocale } from "@/interface/http/locale";
import { IssueQueryBlockForm } from "./issue-query-block-form";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadMyPagePreferences } from "@/application/my-page/load-preferences";
import {
  isIssueQueryBlock,
  MY_PAGE_BLOCK_TYPES,
  MY_PAGE_GROUPS,
  nextIssueQueryBlockId,
  type MyPageBlockType,
  type MyPageGroup,
  type StaticMyPageBlockType,
} from "@/domain/my-page/entity";
import { resolveTimelogDays } from "@/domain/my-page/resolve";
import { DrizzleMyPageRepository } from "@/infrastructure/db/repositories/my-page-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AddBlockForm } from "./add-block-form";
import {
  loadActivityBlock,
  loadCalendarBlock,
  loadDocumentsBlock,
  loadIssueBlocks,
  loadIssueQueryBlock,
  loadNewsBlock,
  loadSelectableIssueQueries,
  loadTimelogBlock,
  loadUpdatedByMeBlock,
  type ActivityBlockItem,
  type CalendarBlockItem,
  type DocumentBlockItem,
  type IssueBlockItem,
  type NewsBlockItem,
  type TimelogBlockItem,
} from "./block-data";
import { BlockControls } from "./block-controls";
import { TimelogDaysForm } from "./timelog-days-form";

export const dynamic = "force-dynamic";

const BLOCK_LABEL: Record<StaticMyPageBlockType, MessageKey> = {
  issues_assigned_to_me: "my.blockIssuesAssigned",
  issues_reported_by_me: "my.blockIssuesReported",
  issues_updated_by_me: "my.blockIssuesUpdated",
  issues_watched: "my.blockIssuesWatched",
  calendar: "my.blockCalendar",
  news: "my.blockNews",
  documents: "my.blockDocuments",
  timelog: "my.blockTimelog",
  activity: "my.blockActivity",
};

/** Labels for every block on the page; the saved-query blocks share one label, the query's name is shown in the block. */
function blockLabel(block: MyPageBlockType, locale: Locale): string {
  return isIssueQueryBlock(block) ? translate(locale, "my.blockSavedQuery") : translate(locale, BLOCK_LABEL[block]);
}

function CalendarBlockList({ items, locale }: { items: CalendarBlockItem[]; locale: Locale }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{translate(locale, "my.noSchedule")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className="border-b pb-1">
          <Link href={`/projects/${item.projectIdentifier}/issues/${item.id}`} className="underline">
            {item.subject}
          </Link>{" "}
          <span className="text-gray-500">
            — {item.startDate ? interpolate(translate(locale, "my.startDate"), { date: item.startDate }) : ""} {item.dueDate ? interpolate(translate(locale, "my.dueDate"), { date: item.dueDate }) : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActivityBlockList({ items, locale }: { items: ActivityBlockItem[]; locale: Locale }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{translate(locale, "my.none")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.key} className="border-b pb-1">
          <Link href={item.href} className="underline">
            {item.title}
          </Link>{" "}
          <span className="text-gray-500">— {item.occurredAt.toISOString().slice(0, 16).replace("T", " ")}</span>
        </li>
      ))}
    </ul>
  );
}

const GROUP_CLASS: Record<MyPageGroup, string> = {
  top: "flex flex-col gap-8",
  left: "flex flex-col gap-8",
  right: "flex flex-col gap-8",
};

function IssueBlockList({ items, locale }: { items: IssueBlockItem[]; locale: Locale }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{translate(locale, "my.none")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className="border-b pb-1">
          <Link href={`/projects/${item.projectIdentifier}/issues/${item.id}`} className="underline">
            {item.subject}
          </Link>{" "}
          <span className="text-gray-500">— {item.statusName}</span>
        </li>
      ))}
    </ul>
  );
}

function NewsBlockList({ items, locale }: { items: NewsBlockItem[]; locale: Locale }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{translate(locale, "my.none")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className="border-b pb-1">
          <Link href={`/projects/${item.projectIdentifier}/news/${item.id}`} className="underline">
            {item.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DocumentBlockList({ items, locale }: { items: DocumentBlockItem[]; locale: Locale }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{translate(locale, "my.none")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((item) => (
        <li key={item.id} className="border-b pb-1">
          <Link href={`/projects/${item.projectIdentifier}/documents`} className="underline">
            {item.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TimelogBlockList({ items, days, locale }: { items: TimelogBlockItem[]; days: number; locale: Locale }) {
  const total = items.reduce((sum, item) => sum + item.hours, 0);
  return (
    <div className="flex flex-col gap-2">
      <TimelogDaysForm locale={locale} days={days} />
      <p className="text-xs text-gray-500">{interpolate(translate(locale, "my.totalHours"), { total })}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "my.none")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item) => (
            <li key={item.id} className="border-b pb-1">
              {item.spentOn} — {item.projectIdentifier} — {item.hours}h {item.comments}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function MyPage() {
  const locale = await currentLocale();
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const prefs = await loadMyPagePreferences(new DrizzleMyPageRepository(), user.id);
  const placedBlocks = new Set(MY_PAGE_GROUPS.flatMap((group) => prefs.layout[group]));

  const [issueBlocks, news, documents] = await Promise.all([
    loadIssueBlocks(user),
    placedBlocks.has("news") ? loadNewsBlock(user) : Promise.resolve([]),
    placedBlocks.has("documents") ? loadDocumentsBlock(user) : Promise.resolve([]),
  ]);
  const timelogDays = resolveTimelogDays(prefs.blockSettings);
  const timelog = placedBlocks.has("timelog") ? await loadTimelogBlock(user, timelogDays) : [];
  const today = new Date().toISOString().slice(0, 10);
  const updatedByMe = placedBlocks.has("issues_updated_by_me") ? await loadUpdatedByMeBlock(user) : [];
  const calendar = placedBlocks.has("calendar") ? await loadCalendarBlock(user, today) : [];
  // Redmine's activity_days_default window, the same one the project activity page uses.
  const { activityDaysDefault } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const activityTo = new Date();
  const activityFrom = new Date(activityTo.getTime() - activityDaysDefault * 86_400_000);
  const activity = placedBlocks.has("activity") ? await loadActivityBlock(user, activityFrom, activityTo) : [];
  const issueQueryBlockIds = [...prefs.layout.top, ...prefs.layout.left, ...prefs.layout.right].filter(isIssueQueryBlock);
  const issueQueryBlocks = await Promise.all(
    issueQueryBlockIds.map(async (block) => {
      const stored = prefs.blockSettings[block]?.queryId;
      const queryId = typeof stored === "string" ? stored : null;
      const data = queryId ? await loadIssueQueryBlock(user, queryId, today) : null;
      return { block, queryId, data };
    }),
  );
  const selectableQueries = issueQueryBlockIds.length > 0 ? await loadSelectableIssueQueries(user) : [];

  function renderBlockContent(block: MyPageBlockType) {
    switch (block) {
      case "issues_assigned_to_me":
        return <IssueBlockList locale={locale} items={issueBlocks.assigned} />;
      case "issues_reported_by_me":
        return <IssueBlockList locale={locale} items={issueBlocks.reported} />;
      case "issues_updated_by_me":
        return <IssueBlockList locale={locale} items={updatedByMe} />;
      case "calendar":
        return <CalendarBlockList locale={locale} items={calendar} />;
      case "activity":
        return <ActivityBlockList locale={locale} items={activity} />;
      default: {
        const queryBlock = issueQueryBlocks.find((entry) => entry.block === block);
        if (!queryBlock) return null;
        return (
          <div className="flex flex-col gap-2">
            {queryBlock.data ? (
              <>
                <p className="text-xs text-gray-500">{queryBlock.data.name}</p>
                <IssueBlockList locale={locale} items={queryBlock.data.items} />
              </>
            ) : (
              <p className="text-sm text-gray-500">{queryBlock.queryId ? translate(locale, "my.queryNotShown") : translate(locale, "my.chooseQuery")}</p>
            )}
            <IssueQueryBlockForm locale={locale} block={block} queries={selectableQueries} selectedId={queryBlock.queryId} />
          </div>
        );
      }
      case "issues_watched":
        return <IssueBlockList locale={locale} items={issueBlocks.watched} />;
      case "news":
        return <NewsBlockList locale={locale} items={news} />;
      case "documents":
        return <DocumentBlockList locale={locale} items={documents} />;
      case "timelog":
        return <TimelogBlockList locale={locale} items={timelog} days={timelogDays} />;
    }
  }

  const availableBlockOptions: { value: string; label: string }[] = MY_PAGE_BLOCK_TYPES.filter((block) => !placedBlocks.has(block)).map(
    (block) => ({ value: block, label: translate(locale, BLOCK_LABEL[block]) }),
  );
  if (nextIssueQueryBlockId(Object.values(prefs.layout).flat())) {
    availableBlockOptions.push({ value: "issuequery", label: translate(locale, "my.blockSavedQuery") });
  }

  return (
    <main className="p-8 flex flex-col gap-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "my.title")}</h1>
        <div className="flex items-center gap-4">
          <AddBlockForm options={availableBlockOptions} buttonLabel={translate(locale, "my.addBlock")} />
          <Link href="/my/account" className="text-sm underline">
            {translate(locale, "my.accountSettings")}
          </Link>
        </div>
      </div>

      {prefs.layout.top.length > 0 ? (
        <div className={GROUP_CLASS.top}>
          {prefs.layout.top.map((block, index) => (
            <section key={block} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">{blockLabel(block, locale)}</h2>
                <BlockControls locale={locale} block={block} group="top" isFirst={index === 0} isLast={index === prefs.layout.top.length - 1} />
              </div>
              {renderBlockContent(block)}
            </section>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {(["left", "right"] as MyPageGroup[]).map((group) => (
          <div key={group} className={GROUP_CLASS[group]}>
            {prefs.layout[group].map((block, index) => (
              <section key={block} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm">{blockLabel(block, locale)}</h2>
                  <BlockControls locale={locale} block={block} group={group} isFirst={index === 0} isLast={index === prefs.layout[group].length - 1} />
                </div>
                {renderBlockContent(block)}
              </section>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
