import { describe, expect, it } from "bun:test";
import { isSysApiKeyValid, resolveSysApiSettings } from "./sys-api";

describe("resolveSysApiSettings", () => {
  it("is disabled unless sys_api_enabled is exactly \"1\"", () => {
    expect(resolveSysApiSettings({ sys_api_enabled: "1", sys_api_key: "k" }).enabled).toBe(true);
    expect(resolveSysApiSettings({ sys_api_enabled: "true", sys_api_key: "k" }).enabled).toBe(false);
    expect(resolveSysApiSettings({}).enabled).toBe(false);
  });
});

describe("isSysApiKeyValid", () => {
  const enabled = { enabled: true, key: "secret-key" };

  it("accepts the configured key when enabled", () => {
    expect(isSysApiKeyValid(enabled, "secret-key")).toBe(true);
  });

  it("rejects a wrong key, a key of another length, and a missing key", () => {
    expect(isSysApiKeyValid(enabled, "secret-kez")).toBe(false);
    expect(isSysApiKeyValid(enabled, "secret")).toBe(false);
    expect(isSysApiKeyValid(enabled, null)).toBe(false);
  });

  it("rejects everything while disabled", () => {
    expect(isSysApiKeyValid({ enabled: false, key: "secret-key" }, "secret-key")).toBe(false);
  });

  it("never authorizes with an empty configured key, even against an empty provided key", () => {
    expect(isSysApiKeyValid({ enabled: true, key: "" }, "")).toBe(false);
  });
});
