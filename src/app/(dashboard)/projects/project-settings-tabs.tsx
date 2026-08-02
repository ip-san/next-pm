import Link from "next/link";

export type ProjectSettingsTab = "settings" | "members" | "versions" | "issueCategories";

const TAB_PATH: Record<ProjectSettingsTab, string> = {
  settings: "settings",
  members: "members",
  versions: "versions",
  issueCategories: "issue-categories",
};

const TAB_LABEL: Record<ProjectSettingsTab, string> = {
  settings: "情報",
  members: "メンバー",
  versions: "バージョン",
  issueCategories: "チケットのカテゴリ",
};

/**
 * Mirrors Redmine's project settings tab strip. Versions/members/issue-categories pages have
 * no other inbound link anywhere in the app (verified by grep) — a user reaching any one of
 * these four pages can now discover the other three, matching where a Redmine user would
 * expect to find them (the settings tabs), rather than only from the overview page's nav.
 */
export function ProjectSettingsTabs({
  identifier,
  active,
  visibleTabs,
}: {
  identifier: string;
  active: ProjectSettingsTab;
  visibleTabs: Partial<Record<ProjectSettingsTab, boolean>>;
}) {
  const tabs: ProjectSettingsTab[] = ["settings", "members", "versions", "issueCategories"];

  return (
    <nav className="flex gap-3 text-sm border-b pb-2">
      {tabs
        .filter((tab) => visibleTabs[tab])
        .map((tab) =>
          tab === active ? (
            <span key={tab} className="font-semibold">
              {TAB_LABEL[tab]}
            </span>
          ) : (
            <Link key={tab} href={`/projects/${identifier}/${TAB_PATH[tab]}`} className="underline">
              {TAB_LABEL[tab]}
            </Link>
          ),
        )}
    </nav>
  );
}
