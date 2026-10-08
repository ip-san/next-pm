import { describe, expect, it, mock } from "bun:test";
import { deleteUser, UserNotDeletableError } from "./delete-user";
import { changeUserStatus, UserStatusChangeError } from "./change-user-status";
import type { User } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Smith",
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

const anonymous = user({ id: "anon", login: "", lastname: "Anonymous", status: "anonymous" });

function makeRepos(found: User | null) {
  const userRepository = {
    listAll: mock(async () => []),
    findById: mock(async () => found),
    findByIds: mock(async () => []),
    findByLogin: mock(async () => null),
    findByApiKey: mock(async () => null),
    findByAtomKey: mock(async () => null),
    findByMail: mock(async () => null),
    create: mock(async () => user()),
    updatePassword: mock(async () => {}),
    updateStatus: mock(async () => {}),
    updateProfile: mock(async () => {}),
    updateMail: mock(async () => {}),
    setAtomKey: mock(async () => {}),
    setApiKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  } satisfies UserRepository;
  const userAdminRepository = {
    update: mock(async () => user()),
    updateStatus: mock(async () => {}),
    findOrCreateAnonymous: mock(async () => anonymous),
    reassignReferencesAndDelete: mock(async () => {}),
  } satisfies UserAdminRepository;
  return { userRepository, userAdminRepository };
}

describe("deleteUser", () => {
  it("reassigns the user's records to the anonymous placeholder before deleting", async () => {
    const repositories = makeRepos(user());

    await deleteUser(repositories, "user-1", "admin-1");

    expect(repositories.userAdminRepository.reassignReferencesAndDelete).toHaveBeenCalledWith("user-1", "anon");
  });

  it("refuses to delete the acting admin's own account", async () => {
    const repositories = makeRepos(user({ id: "admin-1" }));
    await expect(deleteUser(repositories, "admin-1", "admin-1")).rejects.toThrow(UserNotDeletableError);
    expect(repositories.userAdminRepository.reassignReferencesAndDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete the anonymous placeholder", async () => {
    const repositories = makeRepos(anonymous);
    await expect(deleteUser(repositories, "anon", "admin-1")).rejects.toThrow(UserNotDeletableError);
    expect(repositories.userAdminRepository.reassignReferencesAndDelete).not.toHaveBeenCalled();
  });
});

describe("changeUserStatus", () => {
  it("activates a registered account", async () => {
    const repositories = makeRepos(user({ status: "registered" }));
    await changeUserStatus(repositories, "user-1", "active", "admin-1");
    expect(repositories.userAdminRepository.updateStatus).toHaveBeenCalledWith("user-1", "active");
  });

  it("unlocks a locked account through the same activate path", async () => {
    const repositories = makeRepos(user({ status: "locked" }));
    await changeUserStatus(repositories, "user-1", "active", "admin-1");
    expect(repositories.userAdminRepository.updateStatus).toHaveBeenCalledWith("user-1", "active");
  });

  it("refuses to lock the acting admin's own account", async () => {
    const repositories = makeRepos(user({ id: "admin-1" }));
    await expect(changeUserStatus(repositories, "admin-1", "locked", "admin-1")).rejects.toThrow(
      UserStatusChangeError,
    );
    expect(repositories.userAdminRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("refuses to touch the anonymous placeholder", async () => {
    const repositories = makeRepos(anonymous);
    await expect(changeUserStatus(repositories, "anon", "locked", "admin-1")).rejects.toThrow(UserStatusChangeError);
  });
});
