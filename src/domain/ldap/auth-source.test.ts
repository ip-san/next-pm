import { describe, expect, it } from "bun:test";
import { validateLdapAuthSourceInput, type LdapAuthSourceInput } from "./auth-source";

const valid: LdapAuthSourceInput = {
  name: "Corp",
  host: "ldap.example.com",
  port: 389,
  account: null,
  password: null,
  baseDn: "dc=example,dc=com",
  attrLogin: "uid",
  attrFirstname: "givenName",
  attrLastname: "sn",
  attrMail: "mail",
  tls: false,
  verifyPeer: true,
  onthefly: false,
  filter: null,
};

describe("validateLdapAuthSourceInput", () => {
  it("accepts a complete source", () => {
    expect(validateLdapAuthSourceInput(valid)).toBeNull();
  });

  it("refuses a host with a scheme or a path", () => {
    expect(validateLdapAuthSourceInput({ ...valid, host: "ldap://ldap.example.com" })).not.toBeNull();
    expect(validateLdapAuthSourceInput({ ...valid, host: "ldap.example.com/x" })).not.toBeNull();
  });

  it("accepts an IPv6 address", () => {
    expect(validateLdapAuthSourceInput({ ...valid, host: "[::1]" })).toBeNull();
  });

  it("refuses a port out of range", () => {
    expect(validateLdapAuthSourceInput({ ...valid, port: 0 })).not.toBeNull();
    expect(validateLdapAuthSourceInput({ ...valid, port: 70000 })).not.toBeNull();
  });

  it("refuses a filter that isn't wrapped in parentheses", () => {
    expect(validateLdapAuthSourceInput({ ...valid, filter: "uid=x" })).not.toBeNull();
    expect(validateLdapAuthSourceInput({ ...valid, filter: "(objectClass=person)" })).toBeNull();
  });
});
