import { describe, expect, it, mock } from "bun:test";
import { AccountNotDeletableError, deleteOwnAccount } from "./delete-own-account";
import type { User } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Smith",
    isAdmin: false,
    status: "active",
    language: null,
    mailNotification: "all",
    passwordHash: "",
    passwordSalt: "",
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

function makeRepositories(self: User, others: User[] = []) {
  const anonymous = makeUser({ id: "anon", login: "", status: "anonymous" });
  const reassignReferencesAndDelete = mock(async () => {});
  const findOrCreateAnonymous = mock(async () => anonymous);

  const userRepository = {
    findById: mock(async () => self),
    listAll: mock(async () => [self, ...others]),
  } as unknown as UserRepository;
  const userAdminRepository = {
    findOrCreateAnonymous,
    reassignReferencesAndDelete,
  } as unknown as UserAdminRepository;

  return { repositories: { userRepository, userAdminRepository }, reassignReferencesAndDelete, findOrCreateAnonymous };
}

describe("deleteOwnAccount", () => {
  it("reassigns authored content to the anonymous placeholder and deletes the account", async () => {
    const self = makeUser();
    const { repositories, reassignReferencesAndDelete, findOrCreateAnonymous } = makeRepositories(self);

    await deleteOwnAccount(repositories, "user-1", true);

    expect(findOrCreateAnonymous).toHaveBeenCalled();
    expect(reassignReferencesAndDelete).toHaveBeenCalledWith("user-1", "anon");
  });

  it("refuses while the unsubscribe setting is off, without touching anything", async () => {
    const { repositories, reassignReferencesAndDelete } = makeRepositories(makeUser());

    await expect(deleteOwnAccount(repositories, "user-1", false)).rejects.toBeInstanceOf(AccountNotDeletableError);
    expect(reassignReferencesAndDelete).not.toHaveBeenCalled();
  });

  it("refuses for the last active administrator", async () => {
    const self = makeUser({ isAdmin: true });
    const others = [makeUser({ id: "other", isAdmin: false }), makeUser({ id: "locked-admin", isAdmin: true, status: "locked" })];
    const { repositories, reassignReferencesAndDelete } = makeRepositories(self, others);

    await expect(deleteOwnAccount(repositories, "user-1", true)).rejects.toBeInstanceOf(AccountNotDeletableError);
    expect(reassignReferencesAndDelete).not.toHaveBeenCalled();
  });

  it("allows an administrator to leave once another active administrator remains", async () => {
    const self = makeUser({ isAdmin: true });
    const others = [makeUser({ id: "other-admin", isAdmin: true, status: "active" })];
    const { repositories, reassignReferencesAndDelete } = makeRepositories(self, others);

    await deleteOwnAccount(repositories, "user-1", true);
    expect(reassignReferencesAndDelete).toHaveBeenCalledWith("user-1", "anon");
  });

  it("refuses for an unknown user", async () => {
    const { repositories } = makeRepositories(makeUser());
    repositories.userRepository.findById = mock(async () => null);
    await expect(deleteOwnAccount(repositories, "ghost", true)).rejects.toBeInstanceOf(AccountNotDeletableError);
  });
});
