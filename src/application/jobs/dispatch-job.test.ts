import { describe, expect, it, mock } from "bun:test";
import { dispatchJob, UnknownJobTypeError } from "./dispatch-job";
import type { Job } from "@/domain/job/entity";
import type { Mailer } from "@/domain/mailer/port";
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
    mustChangePassword: false,
    apiKey: null,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    jobType: "notify",
    payload: { recipientIds: ["user-1"], subject: "Subject", body: "Body" },
    status: "processing",
    attempts: 0,
    availableAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("dispatchJob", () => {
  it("sends mail to active recipients' addresses", async () => {
    const mailer: Mailer = { send: mock(async () => {}) };
    const userRepository: UserRepository = {
      listAll: mock(async () => []),
      findById: mock(async () => makeUser()),
      findByIds: mock(async () => []),
      findByLogin: mock(async () => null),
      findByApiKey: mock(async () => null),
      findByMail: mock(async () => null),
      create: mock(async (u) => ({ ...u, id: "x" }) as User),
    };
    await dispatchJob({ mailer, userRepository }, makeJob());
    expect(mailer.send).toHaveBeenCalledWith({ to: ["alice@example.com"], subject: "Subject", body: "Body" });
  });

  it("excludes locked/registered (non-active) recipients", async () => {
    const mailer: Mailer = { send: mock(async () => {}) };
    const userRepository: UserRepository = {
      listAll: mock(async () => []),
      findById: mock(async () => makeUser({ status: "locked" })),
      findByIds: mock(async () => []),
      findByLogin: mock(async () => null),
      findByApiKey: mock(async () => null),
      findByMail: mock(async () => null),
      create: mock(async (u) => ({ ...u, id: "x" }) as User),
    };
    await dispatchJob({ mailer, userRepository }, makeJob());
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("skips sending when no recipient resolves to a user", async () => {
    const mailer: Mailer = { send: mock(async () => {}) };
    const userRepository: UserRepository = {
      listAll: mock(async () => []),
      findById: mock(async () => null),
      findByIds: mock(async () => []),
      findByLogin: mock(async () => null),
      findByApiKey: mock(async () => null),
      findByMail: mock(async () => null),
      create: mock(async (u) => ({ ...u, id: "x" }) as User),
    };
    await dispatchJob({ mailer, userRepository }, makeJob());
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("throws on an unknown job type", async () => {
    const mailer: Mailer = { send: mock(async () => {}) };
    const userRepository: UserRepository = {
      listAll: mock(async () => []),
      findById: mock(async () => null),
      findByIds: mock(async () => []),
      findByLogin: mock(async () => null),
      findByApiKey: mock(async () => null),
      findByMail: mock(async () => null),
      create: mock(async (u) => ({ ...u, id: "x" }) as User),
    };
    await expect(dispatchJob({ mailer, userRepository }, makeJob({ jobType: "unknown" }))).rejects.toThrow(UnknownJobTypeError);
  });
});
