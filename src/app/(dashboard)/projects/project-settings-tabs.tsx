import Link from "next/link";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

export type ProjectSettingsTab = "settings" | "members" | "versions" | "issueCategories" | "repositories" | "activities" | "wiki";

const TAB_PATH: Record<ProjectSettingsTab, string> = {
  settings: "settings",
  members: "members",
  versions: "versions",
  issueCategories: "issue-categories",
  repositories: "repositories",
  activities: "settings/activities",
  wiki: "settings/wiki",
};

const TAB_LABEL: Record<ProjectSettingsTab, MessageKey> = {
  settings: "projectSettings.tabSettings",
  members: "projectSettings.tabMembers",
  versions: "projectSettings.tabVersions",
  issueCategories: "projectSettings.tabIssueCategories",
  repositories: "projectSettings.tabRepositories",
  activities: "projectSettings.tabActivities",
  wiki: "projectSettings.tabWiki",
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
  locale = "ja",
}: {
  identifier: string;
  active: ProjectSettingsTab;
  visibleTabs: Partial<Record<ProjectSettingsTab, boolean>>;
  locale?: Locale;
}) {
  const tabs: ProjectSettingsTab[] = ["settings", "members", "versions", "issueCategories", "repositories", "activities", "wiki"];

  return (
    <nav className="flex gap-3 text-sm border-b pb-2">
      {tabs
        .filter((tab) => visibleTabs[tab])
        .map((tab) =>
          tab === active ? (
            <span key={tab} className="font-semibold">
              {translate(locale, TAB_LABEL[tab])}
            </span>
          ) : (
            <Link key={tab} href={`/projects/${identifier}/${TAB_PATH[tab]}`} className="underline">
              {translate(locale, TAB_LABEL[tab])}
            </Link>
          ),
        )}
    </nav>
  );
}
