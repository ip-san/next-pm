import { describe, expect, it, mock } from "bun:test";
import { login } from "./login";
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
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: null,
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
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  };
}

function fakeLdap(overrides: Partial<LdapAuthenticator> = {}): LdapAuthenticator {
  return {
    authenticate: mock(async () => null as LdapUserAttributes | null),
    ...overrides,
  };
}

describe("login use case", () => {
  it("succeeds with correct credentials on an active account", async () => {
    const user = makeUser();
    const result = await login({ userRepository: repoWith(user), ldapAuthenticator: null }, "alice", "s3cret-pass");
    expect(result).toEqual({ ok: true, twofaRequired: false, user });
  });

  it("reports twofaRequired for a user with an active TOTP pairing", async () => {
    const user = makeUser({ twofaScheme: "totp", twofaTotpKey: "encrypted", twofaTotpLastUsedStep: 5 });
    const result = await login({ userRepository: repoWith(user), ldapAuthenticator: null }, "alice", "s3cret-pass");
    expect(result).toEqual({ ok: true, twofaRequired: true, user });
  });

  it("rejects a wrong password", async () => {
    const result = await login({ userRepository: repoWith(makeUser()), ldapAuthenticator: null }, "alice", "wrong");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects an unknown login when LDAP isn't configured", async () => {
    const result = await login({ userRepository: repoWith(null), ldapAuthenticator: null }, "ghost", "whatever");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects a locked account even with the correct password", async () => {
    const user = makeUser({ status: "locked" });
    const result = await login({ userRepository: repoWith(user), ldapAuthenticator: null }, "alice", "s3cret-pass");
    expect(result).toEqual({ ok: false, reason: "account_not_active" });
  });

  describe("with an existing local user tied to LDAP (authSource === 'ldap')", () => {
    it("delegates the password check to LDAP, ignoring the (empty) local hash", async () => {
      const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
      const ldapAuthenticator = fakeLdap({
        authenticate: mock(async () => ({ firstname: "Alice", lastname: "Doe", mail: "alice@example.com" })),
      });
      const result = await login({ userRepository: repoWith(user), ldapAuthenticator }, "alice", "directory-password");
      expect(result).toEqual({ ok: true, twofaRequired: false, user });
      expect(ldapAuthenticator.authenticate).toHaveBeenCalledWith("alice", "directory-password");
    });

    it("rejects when the LDAP bind fails", async () => {
      const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
      const result = await login({ userRepository: repoWith(user), ldapAuthenticator: fakeLdap() }, "alice", "wrong");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    });

    it("rejects when LDAP is configured to delegate to but the authenticator is unavailable", async () => {
      const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
      const result = await login({ userRepository: repoWith(user), ldapAuthenticator: null }, "alice", "whatever");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    });
  });

  describe("on-the-fly LDAP registration for an unknown login", () => {
    it("creates a local user from the directory's attributes on a successful bind", async () => {
      const userRepository = repoWith(null);
      const ldapAuthenticator = fakeLdap({
        authenticate: mock(async () => ({ firstname: "Bob", lastname: "Newuser", mail: "bob@example.com" })),
      });
      const result = await login({ userRepository, ldapAuthenticator }, "bob", "directory-password");
      expect(result.ok).toBe(true);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ login: "bob", mail: "bob@example.com", firstname: "Bob", lastname: "Newuser", authSource: "ldap" }),
      );
    });

    it("does not create a user when the LDAP bind fails", async () => {
      const userRepository = repoWith(null);
      const result = await login({ userRepository, ldapAuthenticator: fakeLdap() }, "ghost", "wrong");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it("does not create a user when LDAP returns no mail address", async () => {
      const userRepository = repoWith(null);
      const ldapAuthenticator = fakeLdap({ authenticate: mock(async () => ({ firstname: "Bob", lastname: "Newuser", mail: "" })) });
      const result = await login({ userRepository, ldapAuthenticator }, "bob", "directory-password");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });
});
