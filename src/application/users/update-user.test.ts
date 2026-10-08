import { describe, expect, it, mock } from "bun:test";
import { updateUser, UserUpdateError, type UpdateUserInput } from "./update-user";
import type { User } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

function user(overrides: Partial<User>): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Dev",
    isAdmin: false,
    status: "active",
    passwordHash: "",
    passwordSalt: "",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: null,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
    language: null,
    mailNotification: "all",
    ...overrides,
  } as User;
}

function repositoryWith(existing: User | null, byLogin: User | null = null) {
  const updatePassword = mock(async () => {});
  const update = mock(async () => existing as User);
  const userRepository = {
    findById: mock(async () => existing),
    findByLogin: mock(async () => byLogin),
    updatePassword,
  } as unknown as UserRepository;
  const userAdminRepository = { update } as unknown as UserAdminRepository;
  return { userRepository, userAdminRepository, update, updatePassword };
}

const base: UpdateUserInput = {
  userId: "user-1",
  login: "alice",
  mail: "alice@example.com",
  firstname: "Alice",
  lastname: "Dev",
  isAdmin: false,
  authSource: null,
  password: "",
};

describe("updateUser", () => {
  it("writes the attributes and leaves the password alone when none is given", async () => {
    const repository = repositoryWith(user({}));
    await updateUser(repository, base, "admin-1");
    expect(repository.update).toHaveBeenCalledWith("user-1", expect.objectContaining({ login: "alice", isAdmin: false }));
    expect(repository.updatePassword).not.toHaveBeenCalled();
  });

  it("refuses an unknown user", async () => {
    await expect(updateUser(repositoryWith(null), base, "admin-1")).rejects.toThrow(UserUpdateError);
  });

  it("refuses a login that another account already uses", async () => {
    const repository = repositoryWith(user({}), user({ id: "user-2", login: "alice" }));
    await expect(updateUser(repository, base, "admin-1")).rejects.toThrow("ログインID");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("refuses a short password before anything is written", async () => {
    const repository = repositoryWith(user({}));
    await expect(updateUser(repository, { ...base, password: "short" }, "admin-1")).rejects.toThrow("8文字");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("hashes a new password when one is given", async () => {
    const repository = repositoryWith(user({}));
    await updateUser(repository, { ...base, password: "longenough1" }, "admin-1");
    expect(repository.updatePassword).toHaveBeenCalledTimes(1);
  });

  it("refuses to switch a directory account to internal authentication without a password", async () => {
    const repository = repositoryWith(user({ authSource: "ldap" }));
    await expect(updateUser(repository, base, "admin-1")).rejects.toThrow("内部認証");
  });

  it("never changes the acting user's own admin flag", async () => {
    const repository = repositoryWith(user({ isAdmin: true }));
    await updateUser(repository, { ...base, isAdmin: false }, "user-1");
    expect(repository.update).toHaveBeenCalledWith("user-1", expect.objectContaining({ isAdmin: true }));
  });
});
