import type { MessageKey } from "@/domain/i18n/messages";

export const MODULE_OPTIONS: { key: string; label: string; labelKey: MessageKey }[] = [
  { key: "issue_tracking", label: "チケットトラッキング", labelKey: "project.issueTracking" },
  { key: "time_tracking", label: "工数管理", labelKey: "projectSettings.moduleTimeTracking" },
  { key: "wiki", label: "Wiki", labelKey: "projectMenu.wiki" },
  { key: "boards", label: "フォーラム", labelKey: "projectMenu.boards" },
  { key: "news", label: "ニュース", labelKey: "projectMenu.news" },
  { key: "documents", label: "ドキュメント", labelKey: "projectMenu.documents" },
  { key: "files", label: "ファイル", labelKey: "projectMenu.files" },
  { key: "repository", label: "リポジトリ", labelKey: "projectMenu.repository" },
  { key: "calendar", label: "カレンダー", labelKey: "projectMenu.calendar" },
  { key: "gantt", label: "ガントチャート", labelKey: "projectMenu.gantt" },
];
