import { describe, expect, it, mock } from "bun:test";
import { resolveCommitterUser } from "./resolve-committer-user";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { Changeset } from "@/domain/scm/entity";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "Dev",
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

function makeChangeset(overrides: Partial<Changeset> = {}): Changeset {
  return {
    id: "cs-1",
    scmRepositoryId: "repo-1",
    revision: "abc",
    committerIdentity: "Alice Dev <alice@example.com>",
    userId: null,
    committedOn: new Date("2024-01-01"),
    comments: "",
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeRepositories(options: {
  latest?: Changeset | null;
  byLogin?: User | null;
  byMail?: User | null;
  byId?: User | null;
}) {
  const changesetRepository = {
    findLatestByCommitter: mock(async () => options.latest ?? null),
  } as unknown as ChangesetRepository;
  const userRepository = {
    findById: mock(async () => options.byId ?? null),
    findByLogin: mock(async () => options.byLogin ?? null),
    findByMail: mock(async () => options.byMail ?? null),
  } as unknown as UserRepository;
  return { changesetRepository, userRepository };
}

describe("resolveCommitterUser", () => {
  it("resolves nobody for a blank committer", async () => {
    const repositories = makeRepositories({ byLogin: makeUser() });
    expect(await resolveCommitterUser(repositories, "repo-1", "   ")).toBeNull();
    expect(repositories.userRepository.findByLogin).not.toHaveBeenCalled();
  });

  // Redmine's first branch: an existing mapping on the newest matching changeset wins outright.
  it("reuses the user already mapped on the newest changeset by that committer", async () => {
    const mapped = makeUser({ id: "user-9", login: "someone-else" });
    const repositories = makeRepositories({ latest: makeChangeset({ userId: "user-9" }), byId: mapped, byLogin: makeUser() });
    expect(await resolveCommitterUser(repositories, "repo-1", "Alice Dev <alice@example.com>")).toEqual(mapped);
    expect(repositories.userRepository.findByLogin).not.toHaveBeenCalled();
  });

  // Redmine looks at that one newest row only; an unmapped newest changeset falls through.
  it("falls through to login/email matching when the newest changeset is unmapped", async () => {
    const byLogin = makeUser({ id: "user-2" });
    const repositories = makeRepositories({ latest: makeChangeset({ userId: null }), byLogin });
    expect(await resolveCommitterUser(repositories, "repo-1", "alice")).toEqual(byLogin);
  });

  it("matches by login before email", async () => {
    const byLogin = makeUser({ id: "by-login" });
    const byMail = makeUser({ id: "by-mail" });
    const repositories = makeRepositories({ byLogin, byMail });
    expect(await resolveCommitterUser(repositories, "repo-1", "alice <someone@example.com>")).toEqual(byLogin);
    expect(repositories.userRepository.findByMail).not.toHaveBeenCalled();
  });

  it("falls back to the email inside the angle brackets", async () => {
    const byMail = makeUser({ id: "by-mail" });
    const repositories = makeRepositories({ byLogin: null, byMail });
    expect(await resolveCommitterUser(repositories, "repo-1", "Alice Dev <alice@example.com>")).toEqual(byMail);
    expect(repositories.userRepository.findByMail).toHaveBeenCalledWith("alice@example.com");
  });

  it("never looks up an email when the committer has none", async () => {
    const repositories = makeRepositories({ byLogin: null, byMail: makeUser() });
    expect(await resolveCommitterUser(repositories, "repo-1", "alice")).toBeNull();
    expect(repositories.userRepository.findByMail).not.toHaveBeenCalled();
  });

  // Redmine's regex needs at least one character before "<", so this committer matches nobody.
  it("resolves nobody for a committer that is only an email in angle brackets", async () => {
    const repositories = makeRepositories({ byLogin: makeUser(), byMail: makeUser() });
    expect(await resolveCommitterUser(repositories, "repo-1", "<alice@example.com>")).toBeNull();
  });
});
