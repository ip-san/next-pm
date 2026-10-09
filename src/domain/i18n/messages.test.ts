import { describe, expect, it } from "bun:test";
import { LOCALES } from "./locales";
import { interpolate, translate, type MessageKey } from "./messages";

const KEYS: MessageKey[] = [
  "nav.projects",
  "login.submit",
  "my.title",
  "projects.title",
  "projectMenu.issues",
  "issues.title",
  "query.column.tracker",
  "query.operator.!*",
  "issue.attr.subject",
  "issue.statusProgress",
  "issueForm.create",
  "timeEntries.logTime",
  "timeEntries.importUserStart",
  "timeReport.title",
  "bulkEdit.submit",
  "issueDelete.timeLegend",
  "projectStatus.confirmArchive",
  "news.create",
  "boards.replies",
  "documents.none",
  "wiki.indexTitle",
  "wiki.childrenQuestion",
  "projectSettings.title",
  "members.viaGroup",
  "versions.sharingTree",
  "projectNew.copyHelp",
  "projectDelete.warningEnd",
  "admin.title",
  "admin.settings.general",
  "admin.duration.unlimited",
  "admin.mail.apiKeyHelp",
  "admin.users.deleteConfirm",
  "admin.groups.title",
  "admin.roles.permissionCount",
  "permission.view_issues",
  "permission.module.core",
  "admin.trackers.deleteConfirm",
  "admin.workflows.fieldHeader",
];

describe("translate", () => {
  it("returns the Japanese text as it has always been", () => {
    expect(translate("ja", "nav.projects")).toBe("プロジェクト");
  });

  it("returns the English text for en", () => {
    expect(translate("en", "nav.projects")).toBe("Projects");
  });

  it("has a non-empty string for every key in every locale", () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(translate(locale, key).length).toBeGreaterThan(0);
      }
    }
  });

  it("fills the placeholders of a translated sentence in either locale", () => {
    expect(interpolate(translate("ja", "issue.statusProgress"), { status: "新規", ratio: 40 })).toBe("ステータス: 新規 / 進捗: 40%");
    expect(interpolate(translate("en", "issue.statusProgress"), { status: "New", ratio: 40 })).toBe("Status: New / Progress: 40%");
  });
});
