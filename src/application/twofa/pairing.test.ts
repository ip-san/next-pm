import { randomBytes } from "node:crypto";
import { describe, expect, it, mock } from "bun:test";
import { confirmTotpPairing, deactivateTwofa, startTotpPairing, TotpEncryptionKeyMissingError, UserNotFoundError } from "./pairing";
import { encryptSecret } from "@/domain/crypto/symmetric";
import type { TwofaBackupCodeRepository } from "@/domain/twofa/backup-code-repository";
import { computeTotp } from "@/domain/twofa/totp";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

const KEY = randomBytes(32);

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
  const store = { user };
  return {
    listAll: mock(async () => (store.user ? [store.user] : [])),
    findByLogin: mock(async () => store.user),
    findById: mock(async () => store.user),
    findByIds: mock(async () => (store.user ? [store.user] : [])),
    findByApiKey: mock(async () => store.user),
    findByAtomKey: mock(async () => store.user),
    findByMail: mock(async () => store.user),
    create: mock(async (u) => ({ ...u, id: "generated" })),
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async (_id: string, encryptedKey: string) => {
      if (store.user) store.user = { ...store.user, twofaTotpKey: encryptedKey };
    }),
    confirmTotpPairing: mock(async (_id: string, lastUsedStep: number) => {
      if (store.user) store.user = { ...store.user, twofaScheme: "totp", twofaTotpLastUsedStep: lastUsedStep };
    }),
    updateTwofaLastUsedStep: mock(async (_id: string, step: number) => {
      if (store.user) store.user = { ...store.user, twofaTotpLastUsedStep: step };
    }),
    clearTwofa: mock(async () => {
      if (store.user) store.user = { ...store.user, twofaScheme: null, twofaTotpKey: null, twofaTotpLastUsedStep: null };
    }),
  };
}

function fakeBackupCodeRepository(): TwofaBackupCodeRepository {
  return {
    replaceForUser: mock(async () => {}),
    consumeIfMatches: mock(async () => false),
    deleteAllForUser: mock(async () => {}),
  };
}

describe("startTotpPairing", () => {
  it("throws when no encryption key is configured", async () => {
    const userRepository = fakeUserRepository(makeUser());
    await expect(startTotpPairing({ userRepository }, "user-1", null, "next-pm")).rejects.toBeInstanceOf(
      TotpEncryptionKeyMissingError,
    );
  });

  it("throws when the user doesn't exist", async () => {
    const userRepository = fakeUserRepository(null);
    await expect(startTotpPairing({ userRepository }, "ghost", KEY, "next-pm")).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it("generates a secret, encrypts it via setTotpPairing, and does not activate twofaScheme yet", async () => {
    const user = makeUser();
    const userRepository = fakeUserRepository(user);
    const result = await startTotpPairing({ userRepository }, "user-1", KEY, "next-pm");

    expect(result.secretBase32).toMatch(/^[A-Z2-7]+$/);
    expect(result.provisioningUri).toStartWith("otpauth://totp/next-pm:alice?");
    expect(userRepository.setTotpPairing).toHaveBeenCalledTimes(1);

    const [, encryptedKey] = (userRepository.setTotpPairing as ReturnType<typeof mock>).mock.calls[0] as [string, string];
    expect(encryptedKey).not.toBe(result.secretBase32);
    const updated = await userRepository.findById("user-1");
    expect(updated?.twofaScheme).toBeNull();
  });
});

describe("confirmTotpPairing", () => {
  async function pairedUser() {
    const user = makeUser();
    const userRepository = fakeUserRepository(user);
    const { secretBase32 } = await startTotpPairing({ userRepository }, "user-1", KEY, "next-pm");
    return { userRepository, secretBase32 };
  }

  it("throws when no encryption key is configured", async () => {
    const { userRepository } = await pairedUser();
    const backupCodeRepository = fakeBackupCodeRepository();
    await expect(
      confirmTotpPairing({ userRepository, backupCodeRepository }, "user-1", "000000", null, 1_700_000_000),
    ).rejects.toBeInstanceOf(TotpEncryptionKeyMissingError);
  });

  it("rejects when there's no pending pairing", async () => {
    const userRepository = fakeUserRepository(makeUser());
    const backupCodeRepository = fakeBackupCodeRepository();
    const result = await confirmTotpPairing({ userRepository, backupCodeRepository }, "user-1", "123456", KEY, 1_700_000_000);
    expect(result).toEqual({ ok: false, reason: "no_pending_pairing" });
  });

  it("rejects an invalid code without activating 2FA", async () => {
    const { userRepository } = await pairedUser();
    const backupCodeRepository = fakeBackupCodeRepository();
    const result = await confirmTotpPairing({ userRepository, backupCodeRepository }, "user-1", "000000", KEY, 1_700_000_000);
    expect(result).toEqual({ ok: false, reason: "invalid_code" });
    expect(await userRepository.findById("user-1")).toMatchObject({ twofaScheme: null });
  });

  it("activates 2FA and issues 10 backup codes on a correct code", async () => {
    const { userRepository, secretBase32 } = await pairedUser();
    const backupCodeRepository = fakeBackupCodeRepository();
    const now = 1_700_000_000;
    const code = computeTotp(secretBase32, now);

    const result = await confirmTotpPairing({ userRepository, backupCodeRepository }, "user-1", code, KEY, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backupCodes).toHaveLength(10);
      expect(new Set(result.backupCodes).size).toBe(10);
    }
    expect(await userRepository.findById("user-1")).toMatchObject({ twofaScheme: "totp" });
    expect(backupCodeRepository.replaceForUser).toHaveBeenCalledTimes(1);
  });
});

describe("deactivateTwofa", () => {
  it("clears the user's 2FA state and deletes backup codes", async () => {
    const userRepository = fakeUserRepository(
      makeUser({ twofaScheme: "totp", twofaTotpKey: encryptSecret("secret", KEY), twofaTotpLastUsedStep: 5 }),
    );
    const backupCodeRepository = fakeBackupCodeRepository();
    await deactivateTwofa({ userRepository, backupCodeRepository }, "user-1");

    expect(await userRepository.findById("user-1")).toMatchObject({
      twofaScheme: null,
      twofaTotpKey: null,
      twofaTotpLastUsedStep: null,
    });
    expect(backupCodeRepository.deleteAllForUser).toHaveBeenCalledWith("user-1");
  });
});
