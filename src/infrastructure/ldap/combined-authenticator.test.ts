import { describe, expect, it, mock } from "bun:test";
import type { LdapAuthenticator, LdapUserAttributes } from "@/domain/ldap/authenticator";
import { CombinedLdapAuthenticator } from "./combined-authenticator";

const attributes: LdapUserAttributes = { firstname: "Ada", lastname: "Lovelace", mail: "ada@example.test", onthefly: true };

function source(result: LdapUserAttributes | null): LdapAuthenticator {
  return { authenticate: mock(async () => result) };
}

describe("CombinedLdapAuthenticator", () => {
  it("returns the first source that accepts the login and doesn't ask the rest", async () => {
    const first = source(attributes);
    const second = source(null);
    const result = await new CombinedLdapAuthenticator([first, second]).authenticate("ada", "pw");
    expect(result).toEqual(attributes);
    expect(second.authenticate).not.toHaveBeenCalled();
  });

  it("falls through to a later source", async () => {
    const result = await new CombinedLdapAuthenticator([source(null), source(attributes)]).authenticate("ada", "pw");
    expect(result).toEqual(attributes);
  });

  it("returns null when no source accepts", async () => {
    expect(await new CombinedLdapAuthenticator([source(null)]).authenticate("ada", "bad")).toBeNull();
    expect(await new CombinedLdapAuthenticator([]).authenticate("ada", "pw")).toBeNull();
  });
});
