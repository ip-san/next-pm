import Link from "next/link";
import { redirect } from "next/navigation";
import { loadMyPagePreferences } from "@/application/my-page/load-preferences";
import { MY_PAGE_BLOCK_TYPES, MY_PAGE_GROUPS, type MyPageBlockType, type MyPageGroup } from "@/domain/my-page/entity";
import { resolveTimelogDays } from "@/domain/my-page/resolve";
import { DrizzleMyPageRepository } from "@/infrastructure/db/repositories/my-page-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AddBlockForm } from "./add-block-form";
import {
  loadDocumentsBlock,
  loadIssueBlocks,
  loadNewsBlock,
  loadTimelogBlock,
  type DocumentBlockItem,
  type IssueBlockItem,
  type NewsBlockItem,
  type TimelogBlockItem,
} from "./block-data";
import { BlockControls } from "./block-controls";
import { TimelogDaysForm } from "./timelog-days-form";

export const dynamic = "force-dynamic";

const BLOCK_LABEL: Record<MyPageBlockType, string> = {
  issues_assigned_to_me: "担当しているチケット",
  issues_reported_by_me: "登録したチケット",
  issues_watched: "ウォッチしているチケット",
  news: "ニュース",
  documents: "ドキュメント",
  timelog: "工数",
};

const GROUP_CLASS: Record<MyPageGroup, string> = {
  top: "flex flex-col gap-8",
  left: "flex flex-col gap-8",
  right: "flex flex-col gap-8",
};

function IssueBlockList({ items }: { items: IssueBlockItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">なし</p>;
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

function NewsBlockList({ items }: { items: NewsBlockItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">なし</p>;
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

function DocumentBlockList({ items }: { items: DocumentBlockItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">なし</p>;
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

function TimelogBlockList({ items, days }: { items: TimelogBlockItem[]; days: number }) {
  const total = items.reduce((sum, item) => sum + item.hours, 0);
  return (
    <div className="flex flex-col gap-2">
      <TimelogDaysForm days={days} />
      <p className="text-xs text-gray-500">合計 {total}h</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">なし</p>
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

  function renderBlockContent(block: MyPageBlockType) {
    switch (block) {
      case "issues_assigned_to_me":
        return <IssueBlockList items={issueBlocks.assigned} />;
      case "issues_reported_by_me":
        return <IssueBlockList items={issueBlocks.reported} />;
      case "issues_watched":
        return <IssueBlockList items={issueBlocks.watched} />;
      case "news":
        return <NewsBlockList items={news} />;
      case "documents":
        return <DocumentBlockList items={documents} />;
      case "timelog":
        return <TimelogBlockList items={timelog} days={timelogDays} />;
    }
  }

  const availableBlockOptions = MY_PAGE_BLOCK_TYPES.filter((block) => !placedBlocks.has(block)).map((block) => ({
    value: block,
    label: BLOCK_LABEL[block],
  }));

  return (
    <main className="p-8 flex flex-col gap-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">マイページ</h1>
        <div className="flex items-center gap-4">
          <AddBlockForm options={availableBlockOptions} />
          <Link href="/my/account" className="text-sm underline">
            アカウント設定
          </Link>
        </div>
      </div>

      {prefs.layout.top.length > 0 ? (
        <div className={GROUP_CLASS.top}>
          {prefs.layout.top.map((block, index) => (
            <section key={block} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">{BLOCK_LABEL[block]}</h2>
                <BlockControls block={block} group="top" isFirst={index === 0} isLast={index === prefs.layout.top.length - 1} />
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
                  <h2 className="font-semibold text-sm">{BLOCK_LABEL[block]}</h2>
                  <BlockControls block={block} group={group} isFirst={index === 0} isLast={index === prefs.layout[group].length - 1} />
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
