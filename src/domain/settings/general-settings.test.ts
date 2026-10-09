import { describe, expect, it } from "bun:test";
import { GENERAL_SETTING_DEFAULTS, resolveGeneralSettings } from "./general-settings";

describe("resolveGeneralSettings", () => {
  it("falls back to next-pm's prior hardcoded defaults when nothing is persisted", () => {
    const settings = resolveGeneralSettings({});
    expect(settings.attachmentMaxSizeBytes).toBe(25 * 1024 * 1024);
    expect(settings.restApiEnabled).toBe(true);
    expect(settings.feedsLimit).toBe(25);
    expect(settings.activityDaysDefault).toBe(30);
    expect(settings.timelogAccept0Hours).toBe(false);
    expect(settings.repositoryLogDisplayLimit).toBe(10);
    expect(settings.crossProjectIssueRelations).toBe(false);
    expect(settings.issueDoneRatio).toBe("issue_field");
  });

  it("applies a persisted attachment_max_size override (stored in KB)", () => {
    const settings = resolveGeneralSettings({ attachment_max_size: "10240" });
    expect(settings.attachmentMaxSizeBytes).toBe(10240 * 1024);
  });

  it("applies a persisted rest_api_enabled=0 override", () => {
    const settings = resolveGeneralSettings({ rest_api_enabled: "0" });
    expect(settings.restApiEnabled).toBe(false);
  });

  it("falls back to the default when attachment_max_size is not a valid positive number", () => {
    const settings = resolveGeneralSettings({ attachment_max_size: "not-a-number" });
    expect(settings.attachmentMaxSizeBytes).toBe(Number(GENERAL_SETTING_DEFAULTS.attachment_max_size) * 1024);
  });

  it("applies a persisted timelog_accept_0_hours=1 override", () => {
    const settings = resolveGeneralSettings({ timelog_accept_0_hours: "1" });
    expect(settings.timelogAccept0Hours).toBe(true);
  });

  it("applies a persisted cross_project_issue_relations=1 override", () => {
    const settings = resolveGeneralSettings({ cross_project_issue_relations: "1" });
    expect(settings.crossProjectIssueRelations).toBe(true);
  });

  it("applies persisted feeds_limit/activity_days_default/repository_log_display_limit overrides", () => {
    const settings = resolveGeneralSettings({
      feeds_limit: "50",
      activity_days_default: "7",
      repository_log_display_limit: "20",
    });
    expect(settings.feedsLimit).toBe(50);
    expect(settings.activityDaysDefault).toBe(7);
    expect(settings.repositoryLogDisplayLimit).toBe(20);
  });

  it("falls back to defaults for invalid numeric overrides", () => {
    const settings = resolveGeneralSettings({ feeds_limit: "0", activity_days_default: "-5", repository_log_display_limit: "abc" });
    expect(settings.feedsLimit).toBe(25);
    expect(settings.activityDaysDefault).toBe(30);
    expect(settings.repositoryLogDisplayLimit).toBe(10);
  });

  it("applies a persisted issue_done_ratio=issue_status override", () => {
    const settings = resolveGeneralSettings({ issue_done_ratio: "issue_status" });
    expect(settings.issueDoneRatio).toBe("issue_status");
  });

  it("falls back to issue_field for an invalid issue_done_ratio value", () => {
    const settings = resolveGeneralSettings({ issue_done_ratio: "bogus" });
    expect(settings.issueDoneRatio).toBe("issue_field");
  });
});

describe("display_subprojects_issues", () => {
  it("is off by default, so subproject issues stay off every screen until an admin turns it on", () => {
    expect(GENERAL_SETTING_DEFAULTS.display_subprojects_issues).toBe("0");
    expect(resolveGeneralSettings({}).displaySubprojectsIssues).toBe(false);
  });

  it("is on only for the stored value \"1\"", () => {
    expect(resolveGeneralSettings({ display_subprojects_issues: "1" }).displaySubprojectsIssues).toBe(true);
    expect(resolveGeneralSettings({ display_subprojects_issues: "0" }).displaySubprojectsIssues).toBe(false);
  });
});

describe("language settings", () => {
  it("defaults to Japanese with no forcing", () => {
    const resolved = resolveGeneralSettings({});
    expect(resolved.defaultLanguage).toBe("ja");
    expect(resolved.forceDefaultLanguageForAnonymous).toBe(false);
    expect(resolved.forceDefaultLanguageForLoggedIn).toBe(false);
  });

  it("reads a supported default language and the two force flags", () => {
    const resolved = resolveGeneralSettings({ default_language: "en", force_default_language_for_anonymous: "1", force_default_language_for_loggedin: "1" });
    expect(resolved.defaultLanguage).toBe("en");
    expect(resolved.forceDefaultLanguageForAnonymous).toBe(true);
    expect(resolved.forceDefaultLanguageForLoggedIn).toBe(true);
  });

  it("falls back to Japanese for a language the interface doesn't have", () => {
    expect(resolveGeneralSettings({ default_language: "fr" }).defaultLanguage).toBe("ja");
  });
});
