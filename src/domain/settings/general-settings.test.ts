import { describe, expect, it } from "bun:test";
import { GENERAL_SETTING_DEFAULTS, resolveGeneralSettings } from "./general-settings";

describe("resolveGeneralSettings", () => {
  it("falls back to next-pm's prior hardcoded defaults when nothing is persisted", () => {
    const settings = resolveGeneralSettings({});
    expect(settings.attachmentMaxSizeBytes).toBe(25 * 1024 * 1024);
    expect(settings.restApiEnabled).toBe(true);
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
});
