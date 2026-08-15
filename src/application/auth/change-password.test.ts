import { describe, expect, it, mock } from "bun:test";
import { changePassword, CurrentPasswordMismatchError, InvalidPasswordError, LdapPasswordChangeNotAllowedError } from "./change-password";
import { generateSalt, hashPassword, verifyPassword } from "@/domain/user/password";
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

function repoWith(user: User | null) {
  const updatePassword = mock(async () => {});
  const userRepository: UserRepository = {
    listAll: mock(async () => (user ? [user] : [])),
    findByLogin: mock(async () => user),
    findById: mock(async () => user),
    findByIds: mock(async () => (user ? [user] : [])),
    findByApiKey: mock(async () => user),
    findByAtomKey: mock(async () => user),
    findByMail: mock(async () => user),
    create: mock(async (u) => ({ ...u, id: "generated" })),
    updatePassword,
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  };
  return { userRepository, updatePassword };
}

describe("changePassword", () => {
  it("updates the password when the current password is correct", async () => {
    const user = makeUser();
    const { userRepository, updatePassword } = repoWith(user);
    await changePassword({ userRepository }, { userId: "user-1", currentPassword: "s3cret-pass", newPassword: "new-password-1" });
    expect(updatePassword).toHaveBeenCalledTimes(1);
    const [userId, hash, salt] = updatePassword.mock.calls[0] as unknown as [string, string, string];
    expect(userId).toBe("user-1");
    expect(verifyPassword("new-password-1", salt, hash)).toBe(true);
  });

  it("rejects a wrong current password without updating anything", async () => {
    const { userRepository, updatePassword } = repoWith(makeUser());
    await expect(
      changePassword({ userRepository }, { userId: "user-1", currentPassword: "wrong", newPassword: "new-password-1" }),
    ).rejects.toThrow(CurrentPasswordMismatchError);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { userRepository, updatePassword } = repoWith(makeUser());
    await expect(
      changePassword({ userRepository }, { userId: "user-1", currentPassword: "s3cret-pass", newPassword: "short" }),
    ).rejects.toThrow(InvalidPasswordError);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("rejects an LDAP user before even checking the current password", async () => {
    const user = makeUser({ authSource: "ldap", passwordHash: "", passwordSalt: "" });
    const { userRepository, updatePassword } = repoWith(user);
    await expect(
      changePassword({ userRepository }, { userId: "user-1", currentPassword: "anything", newPassword: "new-password-1" }),
    ).rejects.toThrow(LdapPasswordChangeNotAllowedError);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("rejects an unknown user", async () => {
    const { userRepository, updatePassword } = repoWith(null);
    await expect(
      changePassword({ userRepository }, { userId: "ghost", currentPassword: "anything", newPassword: "new-password-1" }),
    ).rejects.toThrow(CurrentPasswordMismatchError);
    expect(updatePassword).not.toHaveBeenCalled();
  });
});
