import { describe, expect, it, mock } from "bun:test";
import { login } from "./login";
import { generateSalt, hashPassword } from "@/domain/user/password";
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
    findByMail: mock(async () => user),
    create: mock(async (u) => ({ ...u, id: "generated" })),
  };
}

describe("login use case", () => {
  it("succeeds with correct credentials on an active account", async () => {
    const user = makeUser();
    const result = await login(repoWith(user), "alice", "s3cret-pass");
    expect(result).toEqual({ ok: true, user });
  });

  it("rejects a wrong password", async () => {
    const result = await login(repoWith(makeUser()), "alice", "wrong");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects an unknown login", async () => {
    const result = await login(repoWith(null), "ghost", "whatever");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("rejects a locked account even with the correct password", async () => {
    const user = makeUser({ status: "locked" });
    const result = await login(repoWith(user), "alice", "s3cret-pass");
    expect(result).toEqual({ ok: false, reason: "account_not_active" });
  });
});
