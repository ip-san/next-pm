import { describe, expect, it } from "bun:test";
import { resolveAuthModeChoice } from "./auth-mode";

const SOURCE_ID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const FORGED_ID = "00000000-0000-4000-8000-000000000000";

describe("resolveAuthModeChoice", () => {
  it("maps internal authentication to neither column", () => {
    expect(resolveAuthModeChoice("", { envLdapConfigured: true, ldapSourceIds: [SOURCE_ID] })).toEqual({
      ok: true,
      choice: { authSource: null, ldapAuthSourceId: null },
    });
  });

  it("maps the environment source to ldap with no source id", () => {
    expect(resolveAuthModeChoice("env", { envLdapConfigured: true, ldapSourceIds: [] })).toEqual({
      ok: true,
      choice: { authSource: "ldap", ldapAuthSourceId: null },
    });
  });

  it("refuses the environment source when it is not configured", () => {
    const resolution = resolveAuthModeChoice("env", { envLdapConfigured: false, ldapSourceIds: [SOURCE_ID] });
    expect(resolution.ok).toBe(false);
  });

  it("maps an admin-managed source to ldap with its id", () => {
    expect(resolveAuthModeChoice(SOURCE_ID, { envLdapConfigured: false, ldapSourceIds: [SOURCE_ID] })).toEqual({
      ok: true,
      choice: { authSource: "ldap", ldapAuthSourceId: SOURCE_ID },
    });
  });

  it("refuses an id that is not an existing admin-managed source", () => {
    const resolution = resolveAuthModeChoice(FORGED_ID, { envLdapConfigured: true, ldapSourceIds: [SOURCE_ID] });
    expect(resolution.ok).toBe(false);
  });

  it("refuses an arbitrary string", () => {
    const resolution = resolveAuthModeChoice("ldap", { envLdapConfigured: true, ldapSourceIds: [SOURCE_ID] });
    expect(resolution.ok).toBe(false);
  });
});
