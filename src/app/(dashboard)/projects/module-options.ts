import type { MessageKey } from "@/domain/i18n/messages";

export const MODULE_OPTIONS: { key: string; labelKey: MessageKey }[] = [
  { key: "issue_tracking", labelKey: "project.issueTracking" },
  { key: "time_tracking", labelKey: "projectSettings.moduleTimeTracking" },
  { key: "wiki", labelKey: "projectMenu.wiki" },
  { key: "boards", labelKey: "projectMenu.boards" },
  { key: "news", labelKey: "projectMenu.news" },
  { key: "documents", labelKey: "projectMenu.documents" },
  { key: "files", labelKey: "projectMenu.files" },
  { key: "repository", labelKey: "projectMenu.repository" },
  { key: "calendar", labelKey: "projectMenu.calendar" },
  { key: "gantt", labelKey: "projectMenu.gantt" },
];
