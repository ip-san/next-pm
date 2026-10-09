import { describe, expect, it, mock } from "bun:test";
import { verifyCurrentPassword } from "./verify-current-password";
import { generateSalt, hashPassword } from "@/domain/user/password";
import type { LdapAuthenticator, LdapUserAttributes } from "@/domain/ldap/authenticator";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function makeUser(overrides: Partial<User> = {}): User {
  const salt = generateSalt();
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Doe",
    isAdmin: false,
    status: "active",
    passwordSalt: salt,
    passwordHash: hashPassword("s3cret-pass", salt),
    language: null,
    mailNotification: "all" as const,
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: null,
    ldapAuthSourceId: null,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
    ...overrides,
  };
}

function repoWith(user: User | null): UserRepository {
  return {
    listAll: mock(async () => (user ? [user] : [])),
    findByLogin: mock(async () => user),
    findById: mock(async () => user),
    findByIds: mock(async () => (user ? [user] : [])),
    findByApiKey: mock(async () => user),
    findByAtomKey: mock(async () => user),
    findByMail: mock(async () => user),
    create: mock(async (u) => ({ ...u, id: "generated" })),
    updateProfile: mock(async () => {}),
    updateMail: mock(async () => {}),
    updateStatus: mock(async () => {}),
    updatePassword: mock(async () => {}),
    setApiKey: mock(async () => {}),
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  };
}

describe("verifyCurrentPassword", () => {
  it("returns true for the correct local password", async () => {
    const ok = await verifyCurrentPassword({ userRepository: repoWith(makeUser()), ldapSources: [] }, "user-1", "s3cret-pass");
    expect(ok).toBe(true);
  });

  it("returns false for a wrong local password", async () => {
    const ok = await verifyCurrentPassword({ userRepository: repoWith(makeUser()), ldapSources: [] }, "user-1", "wrong");
    expect(ok).toBe(false);
  });

  it("returns false for an unknown user", async () => {
    const ok = await verifyCurrentPassword({ userRepository: repoWith(null), ldapSources: [] }, "ghost", "whatever");
    expect(ok).toBe(false);
  });

  it("delegates to LDAP for an authSource === 'ldap' user", async () => {
    const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
    const ldapAuthenticator: LdapAuthenticator = {
      authenticate: mock(async () => ({ firstname: "Alice", lastname: "Doe", mail: "alice@example.com" }) as LdapUserAttributes),
    };
    const ok = await verifyCurrentPassword({ userRepository: repoWith(user), ldapSources: [{ id: null, authenticator: ldapAuthenticator }] }, "user-1", "directory-password");
    expect(ok).toBe(true);
    expect(ldapAuthenticator.authenticate).toHaveBeenCalledWith("alice", "directory-password");
  });

  it("returns false when LDAP is required but unavailable", async () => {
    const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
    const ok = await verifyCurrentPassword({ userRepository: repoWith(user), ldapSources: [] }, "user-1", "whatever");
    expect(ok).toBe(false);
  });
});

describe("verifyCurrentPassword LDAP sources", () => {
  it("doesn't accept an LDAP user's password from a source other than the one that created them", async () => {
    const user = { ...makeUser(), authSource: "ldap" as const, ldapAuthSourceId: "source-a", passwordHash: "", passwordSalt: "" };
    const a: LdapAuthenticator = { authenticate: mock(async () => null) };
    const b: LdapAuthenticator = { authenticate: mock(async () => ({ firstname: "A", lastname: "B", mail: "a@b.test", onthefly: true })) };
    const ok = await verifyCurrentPassword(
      { userRepository: repoWith(user), ldapSources: [{ id: "source-a", authenticator: a }, { id: "source-b", authenticator: b }] },
      "user-1",
      "password",
    );
    expect(ok).toBe(false);
    expect(b.authenticate).not.toHaveBeenCalled();
  });
});
