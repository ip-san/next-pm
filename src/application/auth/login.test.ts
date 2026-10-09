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

function fakeLdap(overrides: Partial<LdapAuthenticator> = {}): LdapAuthenticator {
  return {
    authenticate: mock(async () => null as LdapUserAttributes | null),
    ...overrides,
  };
}

describe("login use case", () => {
  it("succeeds with correct credentials on an active account", async () => {
    const user = makeUser();
    const result = await login({ userRepository: repoWith(user), ldapSources: [] }, "alice", "s3cret-pass", "1");
    expect(result).toEqual({ ok: true, user, outcome: { kind: "allowed" } });
  });

  it("reports twofaRequired for a user with an active TOTP pairing", async () => {
    const user = makeUser({ twofaScheme: "totp", twofaTotpKey: "encrypted", twofaTotpLastUsedStep: 5 });
    const result = await login({ userRepository: repoWith(user), ldapSources: [] }, "alice", "s3cret-pass", "1");
    expect(result).toEqual({ ok: true, user, outcome: { kind: "twofa_required" } });
  });

  it("rejects a wrong password", async () => {
    const result = await login({ userRepository: repoWith(makeUser()), ldapSources: [] }, "alice", "wrong", "1");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects an unknown login when LDAP isn't configured", async () => {
    const result = await login({ userRepository: repoWith(null), ldapSources: [] }, "ghost", "whatever", "1");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("does not hand the caller an 'allowed' outcome when the twofa setting demands a factor the account lacks", async () => {
    const user = makeUser({ isAdmin: true });
    const result = await login({ userRepository: repoWith(user), ldapSources: [] }, "alice", "s3cret-pass", "3");
    expect(result).toEqual({ ok: true, user, outcome: { kind: "twofa_setup_required" } });
  });

  it("does not challenge a paired user once the twofa setting is disabled", async () => {
    const user = makeUser({ twofaScheme: "totp", twofaTotpKey: "encrypted", twofaTotpLastUsedStep: 5 });
    const result = await login({ userRepository: repoWith(user), ldapSources: [] }, "alice", "s3cret-pass", "0");
    expect(result).toEqual({ ok: true, user, outcome: { kind: "allowed" } });
  });

  it("rejects a locked account even with the correct password", async () => {
    const user = makeUser({ status: "locked" });
    const result = await login({ userRepository: repoWith(user), ldapSources: [] }, "alice", "s3cret-pass", "1");
    expect(result).toEqual({ ok: true, user, outcome: { kind: "inactive", status: "locked" } });
  });

  describe("with an existing local user tied to LDAP (authSource === 'ldap')", () => {
    it("delegates the password check to LDAP, ignoring the (empty) local hash", async () => {
      const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
      const ldapAuthenticator = fakeLdap({
        authenticate: mock(async () => ({ firstname: "Alice", lastname: "Doe", mail: "alice@example.com", onthefly: true })),
      });
      const result = await login({ userRepository: repoWith(user), ldapSources: [{ id: null, authenticator: ldapAuthenticator }] }, "alice", "directory-password", "1");
      expect(result).toEqual({ ok: true, user, outcome: { kind: "allowed" } });
      expect(ldapAuthenticator.authenticate).toHaveBeenCalledWith("alice", "directory-password");
    });

    it("rejects when the LDAP bind fails", async () => {
      const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
      const result = await login({ userRepository: repoWith(user), ldapSources: [{ id: null, authenticator: fakeLdap() }] }, "alice", "wrong", "1");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    });

    it("rejects when LDAP is configured to delegate to but the authenticator is unavailable", async () => {
      const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
      const result = await login({ userRepository: repoWith(user), ldapSources: [] }, "alice", "whatever", "1");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    });
  });

  describe("on-the-fly LDAP registration for an unknown login", () => {
    it("creates a local user from the directory's attributes on a successful bind", async () => {
      const userRepository = repoWith(null);
      const ldapAuthenticator = fakeLdap({
        authenticate: mock(async () => ({ firstname: "Bob", lastname: "Newuser", mail: "bob@example.com", onthefly: true })),
      });
      const result = await login({ userRepository, ldapSources: [{ id: null, authenticator: ldapAuthenticator }] }, "bob", "directory-password", "1");
      expect(result.ok).toBe(true);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ login: "bob", mail: "bob@example.com", firstname: "Bob", lastname: "Newuser", authSource: "ldap" }),
      );
    });

    it("does not create a user when the LDAP bind fails", async () => {
      const userRepository = repoWith(null);
      const result = await login({ userRepository, ldapSources: [{ id: null, authenticator: fakeLdap() }] }, "ghost", "wrong", "1");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it("does not create a user when LDAP returns no mail address", async () => {
      const userRepository = repoWith(null);
      const ldapAuthenticator = fakeLdap({ authenticate: mock(async () => ({ firstname: "Bob", lastname: "Newuser", mail: "", onthefly: true })) });
      const result = await login({ userRepository, ldapSources: [{ id: null, authenticator: ldapAuthenticator }] }, "bob", "directory-password", "1");
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  it("doesn't create an account on first sign-in when the source doesn't allow on-the-fly registration", async () => {
    const userRepository = repoWith(null);
    const ldapAuthenticator = fakeLdap({
      authenticate: mock(async () => ({ firstname: "Bob", lastname: "Newuser", mail: "bob@example.com", onthefly: false })),
    });
    const result = await login({ userRepository, ldapSources: [{ id: null, authenticator: ldapAuthenticator }] }, "bob", "ldap-pass", "1");
    expect(result.ok).toBe(false);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  describe("LDAP sources", () => {
    const alice = { ...makeUser(), authSource: "ldap" as const, ldapAuthSourceId: "source-a", passwordHash: "", passwordSalt: "" };
    const accepts = (attrs: LdapUserAttributes) => fakeLdap({ authenticate: mock(async () => attrs) });
    const rejects = () => fakeLdap({ authenticate: mock(async () => null) });
    const attrs: LdapUserAttributes = { firstname: "Alice", lastname: "Doe", mail: "alice@example.com", onthefly: true };

    it("refuses a user linked to source A when only source B accepts the password", async () => {
      const a = rejects();
      const b = accepts(attrs);
      const result = await login(
        { userRepository: repoWith(alice), ldapSources: [{ id: "source-a", authenticator: a }, { id: "source-b", authenticator: b }] },
        "alice",
        "b-directory-password",
        "1",
      );
      expect(result.ok).toBe(false);
      expect(b.authenticate).not.toHaveBeenCalled();
    });

    it("checks a user linked to no admin-managed source against the environment source only", async () => {
      const env = rejects();
      const other = accepts(attrs);
      const result = await login(
        { userRepository: repoWith({ ...alice, ldapAuthSourceId: null }), ldapSources: [{ id: null, authenticator: env }, { id: "source-b", authenticator: other }] },
        "alice",
        "password",
        "1",
      );
      expect(result.ok).toBe(false);
      expect(env.authenticate).toHaveBeenCalled();
      expect(other.authenticate).not.toHaveBeenCalled();
    });

    it("links an on-the-fly account to the source that accepted the login", async () => {
      const userRepository = repoWith(null);
      const result = await login(
        { userRepository, ldapSources: [{ id: "source-a", authenticator: rejects() }, { id: "source-b", authenticator: accepts(attrs) }] },
        "bob",
        "password",
        "1",
      );
      expect(result.ok).toBe(true);
      expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ authSource: "ldap", ldapAuthSourceId: "source-b" }));
    });
  });
});

