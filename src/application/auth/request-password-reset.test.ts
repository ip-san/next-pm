import { describe, expect, it, mock } from "bun:test";
import { LdapPasswordResetNotAllowedError, requestPasswordReset } from "./request-password-reset";
import { generateSalt, hashPassword } from "@/domain/user/password";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";
import type { EmailAddress } from "@/domain/email-address/entity";
import type { EmailAddressRepository } from "@/domain/email-address/repository";
import type { JobRepository } from "@/domain/job/repository";

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

function makeRepos(user: User | null, additionalAddresses: EmailAddress[] = []) {
  const userRepository: UserRepository = {
    listAll: mock(async () => (user ? [user] : [])),
    findByLogin: mock(async () => user),
    findById: mock(async () => user),
    findByIds: mock(async () => (user ? [user] : [])),
    findByApiKey: mock(async () => user),
    findByAtomKey: mock(async () => user),
    findByMail: mock(async () => user),
    create: mock(async (u) => ({ ...u, id: "generated" })),
    updateProfile: mock(async () => {}),
    updateMail: mock(async () => {}),
    updateStatus: mock(async () => {}),
    updatePassword: mock(async () => {}),
    setApiKey: mock(async () => {}),
    setAtomKey: mock(async () => {}),
    setTotpPairing: mock(async () => {}),
    confirmTotpPairing: mock(async () => {}),
    updateTwofaLastUsedStep: mock(async () => {}),
    clearTwofa: mock(async () => {}),
  };
  const deleteForUser = mock(async () => {});
  const create = mock(async (userId: string, tokenHash: string, expiresAt: Date) => ({ id: "token-1", userId, tokenHash, expiresAt, createdAt: new Date() }));
  const passwordResetTokenRepository: PasswordResetTokenRepository = {
    create,
    findByTokenHash: mock(async () => null),
    deleteForUser,
    delete: mock(async () => {}),
  };
  const enqueue = mock(async (jobType: string, payload: unknown) => ({ id: "job-1", jobType, payload, status: "pending" as const, attempts: 0, availableAt: new Date(), createdAt: new Date() }));
  const jobRepository: JobRepository = {
    enqueue,
    claimNext: mock(async () => null),
    markDone: mock(async () => {}),
    markFailed: mock(async () => {}),
  };
  const emailAddressRepository = {
    listForUser: mock(async () => additionalAddresses),
  } as unknown as EmailAddressRepository;
  return { userRepository, passwordResetTokenRepository, emailAddressRepository, jobRepository, deleteForUser, create, enqueue };
}

describe("requestPasswordReset", () => {
  it("does nothing when no user matches the email", async () => {
    const repos = makeRepos(null);
    await requestPasswordReset(repos, "nobody@example.com", "https://example.test");
    expect(repos.create).not.toHaveBeenCalled();
    expect(repos.enqueue).not.toHaveBeenCalled();
  });

  it("does nothing for a non-active user", async () => {
    const repos = makeRepos(makeUser({ status: "locked" }));
    await requestPasswordReset(repos, "alice@example.com", "https://example.test");
    expect(repos.create).not.toHaveBeenCalled();
    expect(repos.enqueue).not.toHaveBeenCalled();
  });

  it("rejects an LDAP user without creating a token or sending mail", async () => {
    const repos = makeRepos(makeUser({ authSource: "ldap" }));
    await expect(requestPasswordReset(repos, "alice@example.com", "https://example.test")).rejects.toThrow(LdapPasswordResetNotAllowedError);
    expect(repos.create).not.toHaveBeenCalled();
    expect(repos.enqueue).not.toHaveBeenCalled();
  });

  it("clears any existing token, creates a new one, and enqueues a mail with the reset link", async () => {
    const repos = makeRepos(makeUser());
    await requestPasswordReset(repos, "alice@example.com", "https://example.test");

    expect(repos.deleteForUser).toHaveBeenCalledWith("user-1");
    expect(repos.create).toHaveBeenCalledTimes(1);
    const [userId, tokenHash] = repos.create.mock.calls[0] as unknown as [string, string, Date];
    expect(userId).toBe("user-1");
    expect(tokenHash).toHaveLength(64); // sha256 hex digest

    expect(repos.enqueue).toHaveBeenCalledTimes(1);
    const [jobType, payload] = repos.enqueue.mock.calls[0] as unknown as [
      string,
      { recipientIds: string[]; recipientAddresses: string[]; body: string },
    ];
    expect(jobType).toBe("notify");
    // Addressed literally, not by user id: a transactional mail must not be filtered by the
    // recipient's mail_notification preference. See the use case's comment.
    expect(payload.recipientIds).toEqual([]);
    expect(payload.recipientAddresses).toEqual(["alice@example.com"]);
    expect(payload.body).toContain("https://example.test/account/lost_password?token=");
  });

  it("sends the link to the additional address the user actually typed, not the default one", async () => {
    const additional = {
      id: "addr-1",
      userId: "user-1",
      address: "alice+work@example.com",
      notify: false,
      createdAt: new Date(),
    };
    const repos = makeRepos(makeUser(), [additional]);
    await requestPasswordReset(repos, "ALICE+WORK@example.com", "https://example.test");

    const [, payload] = repos.enqueue.mock.calls[0] as unknown as [string, { recipientAddresses: string[] }];
    // Mirrors Redmine's `user.mails.detect {|e| email.casecmp(e) == 0} || user.mail`. Note
    // notify is false and it is still used: that flag governs notifications, not this.
    expect(payload.recipientAddresses).toEqual(["alice+work@example.com"]);
  });
});
