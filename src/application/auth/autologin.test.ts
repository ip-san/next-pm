import { describe, expect, it, mock } from "bun:test";
import { consumeAutologinToken, issueAutologinToken } from "./autologin";
import { hashUserToken, type UserToken } from "@/domain/user-token/entity";
import type { UserTokenRepository } from "@/domain/user-token/repository";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

const NOW = new Date("2026-01-01T12:00:00Z");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Doe",
    isAdmin: false,
    status: "active",
    passwordHash: "",
    passwordSalt: "",
    language: null,
    mailNotification: "all" as const,
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

function makeRepositories(user: User | null, token: UserToken | null) {
  const created: { userId: string; tokenHash: string; expiresAt: Date }[] = [];
  const deleted: string[] = [];
  const deletedForUser: string[] = [];

  const userTokenRepository: UserTokenRepository = {
    create: mock(async (userId, action, tokenHash, expiresAt) => {
      created.push({ userId, tokenHash, expiresAt });
      return { id: "token-row", userId, action, tokenHash, expiresAt, createdAt: NOW };
    }),
    findByTokenHash: mock(async () => token),
    delete: mock(async (id: string) => {
      deleted.push(id);
    }),
    deleteForUser: mock(async (userId: string) => {
      deletedForUser.push(userId);
    }),
  };
  const userRepository = { findById: mock(async () => user) } as unknown as UserRepository;
  return { repositories: { userRepository, userTokenRepository }, created, deleted, deletedForUser };
}

function storedToken(overrides: Partial<UserToken> = {}): UserToken {
  return {
    id: "token-row",
    userId: "user-1",
    action: "autologin",
    tokenHash: hashUserToken("raw-token"),
    expiresAt: new Date("2026-02-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("issueAutologinToken", () => {
  it("stores only a hash and revokes any previous cookie for the same user", async () => {
    const { repositories, created, deletedForUser } = makeRepositories(makeUser(), null);
    const token = await issueAutologinToken(repositories, "user-1", 7);

    expect(deletedForUser).toEqual(["user-1"]);
    expect(created).toHaveLength(1);
    expect(created[0].tokenHash).toBe(hashUserToken(token));
    expect(created[0].tokenHash).not.toBe(token);
  });
});

describe("consumeAutologinToken", () => {
  it("accepts a live cookie for an active account", async () => {
    const { repositories, deleted } = makeRepositories(makeUser(), storedToken());
    const result = await consumeAutologinToken(repositories, "raw-token", "1", NOW);

    expect(result).toEqual({ ok: true, user: makeUser() });
    expect(deleted).toEqual([]);
  });

  it("rejects an unknown cookie without touching anything", async () => {
    const { repositories, deleted } = makeRepositories(makeUser(), null);
    expect(await consumeAutologinToken(repositories, "raw-token", "1", NOW)).toEqual({ ok: false, outcome: null });
    expect(deleted).toEqual([]);
  });

  it("consumes an expired cookie so it can't be retried", async () => {
    const expired = storedToken({ expiresAt: new Date("2025-12-31T00:00:00Z") });
    const { repositories, deleted } = makeRepositories(makeUser(), expired);
    expect(await consumeAutologinToken(repositories, "raw-token", "1", NOW)).toEqual({ ok: false, outcome: null });
    expect(deleted).toEqual(["token-row"]);
  });

  it("refuses — and revokes — a cookie belonging to a locked account", async () => {
    const { repositories, deleted } = makeRepositories(makeUser({ status: "locked" }), storedToken());
    expect(await consumeAutologinToken(repositories, "raw-token", "1", NOW)).toEqual({
      ok: false,
      outcome: { kind: "inactive", status: "locked" },
    });
    expect(deleted).toEqual(["token-row"]);
  });

  it("refuses a cookie that would bypass a required second factor", async () => {
    const { repositories } = makeRepositories(makeUser({ twofaScheme: "totp" }), storedToken());
    expect(await consumeAutologinToken(repositories, "raw-token", "1", NOW)).toEqual({
      ok: false,
      outcome: { kind: "twofa_required" },
    });
  });

  it("refuses a cookie for an account the twofa setting now demands a factor from", async () => {
    const { repositories } = makeRepositories(makeUser({ isAdmin: true }), storedToken());
    expect(await consumeAutologinToken(repositories, "raw-token", "3", NOW)).toEqual({
      ok: false,
      outcome: { kind: "twofa_setup_required" },
    });
  });
});
