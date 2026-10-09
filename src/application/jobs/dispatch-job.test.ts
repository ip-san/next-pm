import { describe, expect, it, mock } from "bun:test";
import { dispatchJob, UnknownJobTypeError, type NotifyJobPayload } from "./dispatch-job";
import type { EmailAddress } from "@/domain/email-address/entity";
import type { EmailAddressRepository } from "@/domain/email-address/repository";
import type { Job } from "@/domain/job/entity";
import type { Mailer } from "@/domain/mailer/port";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "A",
    isAdmin: false,
    status: "active",
    passwordHash: "",
    passwordSalt: "",
    language: null,
    mailNotification: "all",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: null,
    ldapAuthSourceId: null,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
    ...overrides,
  };
}

function makeJob(payload: Partial<NotifyJobPayload> = {}, overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    jobType: "notify",
    payload: { recipientIds: ["user-1"], subject: "Subject", body: "Body", ...payload },
    status: "processing",
    attempts: 0,
    availableAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepositories(options: { users?: User[]; preferences?: UserPreferences[]; addresses?: EmailAddress[] } = {}) {
  const mailer: Mailer = { send: mock(async () => {}) };
  const userRepository = {
    findByIds: mock(async () => options.users ?? []),
  } as unknown as UserRepository;
  const userPreferencesRepository = {
    findByUserIds: mock(async () => options.preferences ?? []),
  } as unknown as UserPreferencesRepository;
  const emailAddressRepository = {
    listForUsers: mock(async () => options.addresses ?? []),
  } as unknown as EmailAddressRepository;
  return { mailer, userRepository, userPreferencesRepository, emailAddressRepository };
}

function address(overrides: Partial<EmailAddress> = {}): EmailAddress {
  return { id: "addr-1", userId: "user-1", address: "alice+work@example.com", notify: true, createdAt: new Date(), ...overrides };
}

describe("dispatchJob", () => {
  it("sends mail to active recipients' addresses", async () => {
    const repositories = makeRepositories({ users: [makeUser()] });
    await dispatchJob(repositories, makeJob());
    expect(repositories.mailer.send).toHaveBeenCalledWith({ to: ["alice@example.com"], subject: "Subject", body: "Body" });
  });

  it("excludes locked/registered (non-active) recipients", async () => {
    const repositories = makeRepositories({ users: [makeUser({ status: "locked" })] });
    await dispatchJob(repositories, makeJob());
    expect(repositories.mailer.send).not.toHaveBeenCalled();
  });

  it("skips sending when no recipient resolves to a user", async () => {
    const repositories = makeRepositories({ users: [] });
    await dispatchJob(repositories, makeJob());
    expect(repositories.mailer.send).not.toHaveBeenCalled();
  });

  it("copies the notification to every additional address flagged notify, and no others", async () => {
    const repositories = makeRepositories({
      users: [makeUser()],
      addresses: [address(), address({ id: "addr-2", address: "alice+muted@example.com", notify: false })],
    });
    await dispatchJob(repositories, makeJob());
    expect(repositories.mailer.send).toHaveBeenCalledWith({
      to: ["alice@example.com", "alice+work@example.com"],
      subject: "Subject",
      body: "Body",
    });
  });

  it("suppresses the actor's own copy by default (no_self_notified)", async () => {
    const repositories = makeRepositories({ users: [makeUser()] });
    await dispatchJob(repositories, makeJob({ actorUserId: "user-1" }));
    expect(repositories.mailer.send).not.toHaveBeenCalled();
  });

  it("sends the actor their own copy once they turn no_self_notified off", async () => {
    const repositories = makeRepositories({
      users: [makeUser()],
      preferences: [{ userId: "user-1", ...DEFAULT_USER_PREFERENCES, noSelfNotified: false }],
    });
    await dispatchJob(repositories, makeJob({ actorUserId: "user-1" }));
    expect(repositories.mailer.send).toHaveBeenCalled();
  });

  it("sends nothing to a recipient whose mail_notification is none", async () => {
    const repositories = makeRepositories({ users: [makeUser({ mailNotification: "none" })] });
    await dispatchJob(repositories, makeJob());
    expect(repositories.mailer.send).not.toHaveBeenCalled();
  });

  it("delivers to literal addresses regardless of any user or preference", async () => {
    const repositories = makeRepositories({ users: [] });
    await dispatchJob(repositories, makeJob({ recipientIds: [], recipientAddresses: ["removed@example.com"] }));
    expect(repositories.mailer.send).toHaveBeenCalledWith({
      to: ["removed@example.com"],
      subject: "Subject",
      body: "Body",
    });
  });

  it("throws on an unknown job type", async () => {
    const repositories = makeRepositories();
    await expect(dispatchJob(repositories, makeJob({}, { jobType: "unknown" }))).rejects.toThrow(UnknownJobTypeError);
  });
});
