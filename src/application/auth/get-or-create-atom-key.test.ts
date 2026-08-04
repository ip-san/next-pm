import { describe, expect, it, mock } from "bun:test";
import { getOrCreateAtomKey } from "./get-or-create-atom-key";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Doe",
    isAdmin: false,
    status: "active",
    passwordSalt: "salt",
    passwordHash: "hash",
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

describe("getOrCreateAtomKey", () => {
  it("returns null for an unknown user", async () => {
    const result = await getOrCreateAtomKey(repoWith(null), "ghost");
    expect(result).toBeNull();
  });

  it("returns the existing key without generating a new one", async () => {
    const repo = repoWith(makeUser({ atomKey: "existing-key" }));
    const result = await getOrCreateAtomKey(repo, "user-1");
    expect(result).toBe("existing-key");
    expect(repo.setAtomKey).not.toHaveBeenCalled();
  });

  it("generates and persists a new 40-char hex key when the user has none", async () => {
    const repo = repoWith(makeUser({ atomKey: null }));
    const result = await getOrCreateAtomKey(repo, "user-1");
    expect(result).toMatch(/^[0-9a-f]{40}$/);
    expect(repo.setAtomKey).toHaveBeenCalledWith("user-1", result);
  });
});
