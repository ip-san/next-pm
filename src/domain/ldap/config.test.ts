import { describe, expect, it } from "bun:test";
import { loadLdapConfigFromEnv } from "./config";

describe("loadLdapConfigFromEnv", () => {
  it("returns null when LDAP_HOST is unset — LDAP is disabled by default", () => {
    expect(loadLdapConfigFromEnv({})).toBeNull();
  });

  it("returns null for a blank LDAP_HOST", () => {
    expect(loadLdapConfigFromEnv({ LDAP_HOST: "   " })).toBeNull();
  });

  it("builds an ldap:// url with the default port when LDAP_HOST is set", () => {
    const config = loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com" });
    expect(config?.url).toBe("ldap://ldap.example.com:389");
  });

  it("uses ldaps:// when LDAP_TLS=1", () => {
    const config = loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com", LDAP_TLS: "1" });
    expect(config?.url).toBe("ldaps://ldap.example.com:389");
  });

  it("respects a custom LDAP_PORT", () => {
    const config = loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com", LDAP_PORT: "636" });
    expect(config?.url).toBe("ldap://ldap.example.com:636");
  });

  it("defaults attribute names to common LDAP schema attributes", () => {
    const config = loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com" });
    expect(config).toMatchObject({ attrLogin: "uid", attrFirstname: "givenName", attrLastname: "sn", attrMail: "mail" });
  });

  it("overrides attribute names from env", () => {
    const config = loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com", LDAP_ATTR_LOGIN: "sAMAccountName" });
    expect(config?.attrLogin).toBe("sAMAccountName");
  });

  it("defaults verifyPeer to true unless explicitly disabled", () => {
    expect(loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com" })?.verifyPeer).toBe(true);
    expect(loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com", LDAP_TLS_VERIFY: "0" })?.verifyPeer).toBe(false);
  });

  it("defaults account/accountPassword to null when unset", () => {
    const config = loadLdapConfigFromEnv({ LDAP_HOST: "ldap.example.com" });
    expect(config?.account).toBeNull();
    expect(config?.accountPassword).toBeNull();
  });
});
