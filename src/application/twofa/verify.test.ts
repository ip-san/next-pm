import { randomBytes } from "node:crypto";
import { describe, expect, it, mock } from "bun:test";
import { verifyTwofaCode } from "./verify";
import { encryptSecret } from "@/domain/crypto/symmetric";
import type { TwofaBackupCodeRepository } from "@/domain/twofa/backup-code-repository";
import { computeTotp, generateTotpSecret } from "@/domain/twofa/totp";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

const KEY = randomBytes(32);
const NOW = 1_700_000_000;

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

function fakeUserRepository(user: User | null): UserRepository {
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

function fakeBackupCodeRepository(matches: boolean): TwofaBackupCodeRepository {
  return {
    replaceForUser: mock(async () => {}),
    consumeIfMatches: mock(async () => matches),
    deleteAllForUser: mock(async () => {}),
  };
}

describe("verifyTwofaCode", () => {
  it("verifies via backup code without ever decrypting the TOTP secret", async () => {
    const userRepository = fakeUserRepository(makeUser({ twofaScheme: "totp", twofaTotpKey: "not-decryptable-garbage" }));
    const backupCodeRepository = fakeBackupCodeRepository(true);
    const result = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", "abc123def456", KEY, NOW);
    expect(result).toEqual({ verified: true, method: "backup_code" });
    // The encryption key being wrong/missing must not matter for a backup-code match — assert
    // it by re-running with encryptionKey: null and getting the same success.
    const resultWithoutKey = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", "abc123def456", null, NOW);
    expect(resultWithoutKey).toEqual({ verified: true, method: "backup_code" });
  });

  it("verifies via TOTP and persists the new anti-replay floor", async () => {
    const secret = generateTotpSecret();
    const userRepository = fakeUserRepository(
      makeUser({ twofaScheme: "totp", twofaTotpKey: encryptSecret(secret, KEY), twofaTotpLastUsedStep: null }),
    );
    const backupCodeRepository = fakeBackupCodeRepository(false);
    const code = computeTotp(secret, NOW);

    const result = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", code, KEY, NOW);
    expect(result).toEqual({ verified: true, method: "totp" });
    expect(userRepository.updateTwofaLastUsedStep).toHaveBeenCalledWith("user-1", Math.floor(NOW / 30));
  });

  it("rejects a replayed TOTP code", async () => {
    const secret = generateTotpSecret();
    const step = Math.floor(NOW / 30);
    const userRepository = fakeUserRepository(
      makeUser({ twofaScheme: "totp", twofaTotpKey: encryptSecret(secret, KEY), twofaTotpLastUsedStep: step }),
    );
    const backupCodeRepository = fakeBackupCodeRepository(false);
    const code = computeTotp(secret, NOW);

    const result = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", code, KEY, NOW);
    expect(result).toEqual({ verified: false, method: null });
  });

  it("fails closed (not throws) when the stored secret can't be decrypted with the given key", async () => {
    const secret = generateTotpSecret();
    const userRepository = fakeUserRepository(
      makeUser({ twofaScheme: "totp", twofaTotpKey: encryptSecret(secret, KEY), twofaTotpLastUsedStep: null }),
    );
    const backupCodeRepository = fakeBackupCodeRepository(false);
    const code = computeTotp(secret, NOW);
    const wrongKey = randomBytes(32);

    const result = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", code, wrongKey, NOW);
    expect(result).toEqual({ verified: false, method: null });
  });

  it("returns unverified for a user without 2FA active", async () => {
    const userRepository = fakeUserRepository(makeUser({ twofaScheme: null }));
    const backupCodeRepository = fakeBackupCodeRepository(false);
    const result = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", "123456", KEY, NOW);
    expect(result).toEqual({ verified: false, method: null });
  });

  it("returns unverified when the encryption key is missing and no backup code matched", async () => {
    const secret = generateTotpSecret();
    const userRepository = fakeUserRepository(makeUser({ twofaScheme: "totp", twofaTotpKey: encryptSecret(secret, KEY) }));
    const backupCodeRepository = fakeBackupCodeRepository(false);
    const result = await verifyTwofaCode({ userRepository, backupCodeRepository }, "user-1", "123456", null, NOW);
    expect(result).toEqual({ verified: false, method: null });
  });
});
