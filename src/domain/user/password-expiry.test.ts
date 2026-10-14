import { describe, expect, it } from "bun:test";
import { isPasswordExpired, mustChangePassword } from "./password-expiry";

const now = new Date("2026-10-14T00:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("password expiry", () => {
  it("never expires while password_max_age is 0", () => {
    expect(isPasswordExpired({ passwdChangedOn: null }, 0, now)).toBe(false);
  });

  it("expires a password set longer ago than the maximum age, and one with no recorded change", () => {
    expect(isPasswordExpired({ passwdChangedOn: daysAgo(31) }, 30, now)).toBe(true);
    expect(isPasswordExpired({ passwdChangedOn: daysAgo(29) }, 30, now)).toBe(false);
    expect(isPasswordExpired({ passwdChangedOn: null }, 30, now)).toBe(true);
  });

  it("asks for a change when flagged or expired, but never of an LDAP account", () => {
    expect(mustChangePassword({ mustChangePassword: true, passwdChangedOn: now, authSource: null }, 0, now)).toBe(true);
    expect(mustChangePassword({ mustChangePassword: false, passwdChangedOn: daysAgo(100), authSource: null }, 90, now)).toBe(true);
    expect(mustChangePassword({ mustChangePassword: true, passwdChangedOn: null, authSource: "ldap" }, 90, now)).toBe(false);
  });
});
