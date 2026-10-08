import { describe, expect, it } from "bun:test";
import {
  isSelfRegistrationEnabled,
  isTwofaAvailable,
  parsePasswordCharClasses,
  resolveAuthSettings,
  serializePasswordCharClasses,
} from "./auth-settings";

describe("resolveAuthSettings", () => {
  it("falls back to next-pm's prior behavior when nothing is persisted", () => {
    const settings = resolveAuthSettings({});
    expect(settings.loginRequired).toBe(false);
    expect(settings.autologinDays).toBe(0);
    expect(settings.selfRegistration).toBe("0");
    expect(settings.passwordMinLength).toBe(8);
    expect(settings.passwordRequiredCharClasses).toEqual([]);
    expect(settings.lostPasswordEnabled).toBe(true);
    expect(settings.twofa).toBe("1");
    expect(settings.unsubscribeEnabled).toBe(false);
    expect(settings.gravatarEnabled).toBe(false);
    expect(settings.sessionLifetimeMinutes).toBe(0);
    expect(settings.sessionTimeoutMinutes).toBe(0);
    expect(settings.maxAdditionalEmails).toBe(5);
  });

  it("applies persisted overrides", () => {
    const settings = resolveAuthSettings({
      login_required: "1",
      autologin: "30",
      self_registration: "1",
      password_min_length: "12",
      password_required_char_classes: "digits,uppercase",
      lost_password: "0",
      twofa: "3",
      unsubscribe: "1",
      gravatar_enabled: "1",
      session_lifetime: "720",
      session_timeout: "60",
      max_additional_emails: "2",
    });
    expect(settings.loginRequired).toBe(true);
    expect(settings.autologinDays).toBe(30);
    expect(settings.selfRegistration).toBe("1");
    expect(settings.passwordMinLength).toBe(12);
    expect(settings.passwordRequiredCharClasses).toEqual(["digits", "uppercase"]);
    expect(settings.lostPasswordEnabled).toBe(false);
    expect(settings.twofa).toBe("3");
    expect(settings.unsubscribeEnabled).toBe(true);
    expect(settings.gravatarEnabled).toBe(true);
    expect(settings.sessionLifetimeMinutes).toBe(720);
    expect(settings.sessionTimeoutMinutes).toBe(60);
    expect(settings.maxAdditionalEmails).toBe(2);
  });

  it("keeps 0 for the session and autologin durations, which means 'unlimited'/'disabled' rather than 'invalid'", () => {
    const settings = resolveAuthSettings({ autologin: "0", session_lifetime: "0", session_timeout: "0" });
    expect(settings.autologinDays).toBe(0);
    expect(settings.sessionLifetimeMinutes).toBe(0);
    expect(settings.sessionTimeoutMinutes).toBe(0);
  });

  it("falls back to the default for out-of-range or unparseable values", () => {
    const settings = resolveAuthSettings({
      autologin: "-1",
      self_registration: "9",
      twofa: "bogus",
      password_min_length: "0",
      session_timeout: "not-a-number",
    });
    expect(settings.autologinDays).toBe(0);
    expect(settings.selfRegistration).toBe("0");
    expect(settings.twofa).toBe("1");
    expect(settings.passwordMinLength).toBe(8);
    expect(settings.sessionTimeoutMinutes).toBe(0);
  });

  it("ignores unknown character class names", () => {
    expect(parsePasswordCharClasses("digits, emoji ,lowercase")).toEqual(["digits", "lowercase"]);
  });

  it("serializes character classes in the canonical order, not the caller's", () => {
    expect(serializePasswordCharClasses(["digits", "uppercase"])).toBe("uppercase,digits");
  });
});

describe("isSelfRegistrationEnabled", () => {
  it("is false only for mode 0", () => {
    expect(isSelfRegistrationEnabled(resolveAuthSettings({ self_registration: "0" }))).toBe(false);
    for (const mode of ["1", "2", "3"]) {
      expect(isSelfRegistrationEnabled(resolveAuthSettings({ self_registration: mode }))).toBe(true);
    }
  });
});

describe("isTwofaAvailable", () => {
  it("is false only for mode 0", () => {
    expect(isTwofaAvailable(resolveAuthSettings({ twofa: "0" }))).toBe(false);
    for (const mode of ["1", "2", "3"]) {
      expect(isTwofaAvailable(resolveAuthSettings({ twofa: mode }))).toBe(true);
    }
  });
});
