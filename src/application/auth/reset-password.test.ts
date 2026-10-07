import { describe, expect, it, mock } from "bun:test";
import { InvalidPasswordError, InvalidResetTokenError, resetPassword } from "./reset-password";
import { hashResetToken } from "./request-password-reset";
import { verifyPassword } from "@/domain/user/password";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";
import type { PasswordResetToken } from "@/domain/password-reset/entity";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";
import type { PasswordPolicy } from "@/domain/user/password-policy";

const TEST_POLICY: PasswordPolicy = { minLength: 8, requiredCharClasses: [] };

function makeUserRepository() {
  const updatePassword = mock(async () => {});
  const userRepository: UserRepository = {
    listAll: mock(async () => []),
    findByLogin: mock(async () => null),
    findById: mock(async () => null),
    findByIds: mock(async () => []),
    findByApiKey: mock(async () => null),
    findByAtomKey: mock(async () => null),
    findByMail: mock(async () => null),
    create: mock(async (u) => ({ ...u, id: "generated" }) as User),
    updatePassword,
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  };
  return { userRepository, updatePassword };
}

function makeTokenRepository(token: PasswordResetToken | null) {
  const deleteToken = mock(async () => {});
  const passwordResetTokenRepository: PasswordResetTokenRepository = {
    create: mock(async (userId, tokenHash, expiresAt) => ({ id: "token-1", userId, tokenHash, expiresAt, createdAt: new Date() })),
    findByTokenHash: mock(async () => token),
    deleteForUser: mock(async () => {}),
    delete: deleteToken,
  };
  return { passwordResetTokenRepository, deleteToken };
}

describe("resetPassword", () => {
  it("rejects an unknown token", async () => {
    const { userRepository, updatePassword } = makeUserRepository();
    const { passwordResetTokenRepository } = makeTokenRepository(null);
    await expect(resetPassword({ userRepository, passwordResetTokenRepository }, "raw-token", "new-password-1", TEST_POLICY)).rejects.toThrow(
      InvalidResetTokenError,
    );
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const { userRepository, updatePassword } = makeUserRepository();
    const expired: PasswordResetToken = {
      id: "token-1",
      userId: "user-1",
      tokenHash: hashResetToken("raw-token"),
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    };
    const { passwordResetTokenRepository } = makeTokenRepository(expired);
    await expect(resetPassword({ userRepository, passwordResetTokenRepository }, "raw-token", "new-password-1", TEST_POLICY)).rejects.toThrow(
      InvalidResetTokenError,
    );
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters, leaving the token intact", async () => {
    const { userRepository, updatePassword } = makeUserRepository();
    const valid: PasswordResetToken = {
      id: "token-1",
      userId: "user-1",
      tokenHash: hashResetToken("raw-token"),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      createdAt: new Date(),
    };
    const { passwordResetTokenRepository, deleteToken } = makeTokenRepository(valid);
    await expect(resetPassword({ userRepository, passwordResetTokenRepository }, "raw-token", "short", TEST_POLICY)).rejects.toThrow(InvalidPasswordError);
    expect(updatePassword).not.toHaveBeenCalled();
    expect(deleteToken).not.toHaveBeenCalled();
  });

  it("sets the new password and consumes the token on success", async () => {
    const { userRepository, updatePassword } = makeUserRepository();
    const valid: PasswordResetToken = {
      id: "token-1",
      userId: "user-1",
      tokenHash: hashResetToken("raw-token"),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      createdAt: new Date(),
    };
    const { passwordResetTokenRepository, deleteToken } = makeTokenRepository(valid);
    await resetPassword({ userRepository, passwordResetTokenRepository }, "raw-token", "new-password-1", TEST_POLICY);

    expect(updatePassword).toHaveBeenCalledTimes(1);
    const [userId, hash, salt] = updatePassword.mock.calls[0] as unknown as [string, string, string];
    expect(userId).toBe("user-1");
    expect(verifyPassword("new-password-1", salt, hash)).toBe(true);
    expect(deleteToken).toHaveBeenCalledWith("token-1");
  });
});
