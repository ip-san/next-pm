import { describe, expect, it, mock } from "bun:test";
import {
  activateAccount,
  registerAccount,
  RegistrationInputError,
  SelfRegistrationDisabledError,
} from "./register-account";
import { resolveAuthSettings, type AuthSettings } from "@/domain/settings/auth-settings";
import { hashUserToken, type UserToken } from "@/domain/user-token/entity";
import type { UserTokenRepository } from "@/domain/user-token/repository";
import type { JobRepository } from "@/domain/job/repository";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

const ORIGIN = "http://localhost:3000";

function settingsFor(mode: string): AuthSettings {
  return resolveAuthSettings({ self_registration: mode });
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "newbie",
    mail: "newbie@example.com",
    firstname: "New",
    lastname: "Bie",
    isAdmin: false,
    status: "registered",
    passwordHash: "hash",
    passwordSalt: "salt",
    language: null,
    mailNotification: "all" as const,
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

function makeRepositories(options: { existing?: User | null; all?: User[]; token?: UserToken | null } = {}) {
  const created: Omit<User, "id">[] = [];
  const statuses: { userId: string; status: string }[] = [];
  const tokens: { userId: string; action: string; tokenHash: string }[] = [];
  const jobs: { jobType: string; payload: unknown }[] = [];

  const userRepository = {
    listAll: mock(async () => options.all ?? []),
    findById: mock(async () => options.existing ?? null),
    findByLogin: mock(async () => null),
    findByMail: mock(async () => null),
    create: mock(async (u: Omit<User, "id">) => {
      created.push(u);
      return { ...u, id: "created-id" };
    }),
    updateStatus: mock(async (userId: string, status: string) => {
      statuses.push({ userId, status });
    }),
  } as unknown as UserRepository;

  const userTokenRepository: UserTokenRepository = {
    create: mock(async (userId, action, tokenHash, expiresAt) => {
      tokens.push({ userId, action, tokenHash });
      return { id: "token-1", userId, action, tokenHash, expiresAt, createdAt: new Date() };
    }),
    findByTokenHash: mock(async () => options.token ?? null),
    delete: mock(async () => {}),
    deleteForUser: mock(async () => {}),
  };

  const jobRepository = {
    enqueue: mock(async (jobType: string, payload: unknown) => {
      jobs.push({ jobType, payload });
    }),
  } as unknown as JobRepository;

  return { repositories: { userRepository, userTokenRepository, jobRepository }, created, statuses, tokens, jobs };
}

const INPUT = { login: "newbie", mail: "newbie@example.com", firstname: "New", lastname: "Bie", password: "s3cret-password" };

describe("registerAccount", () => {
  it("refuses outright while self_registration is disabled, whatever the caller's UI showed", async () => {
    const { repositories, created } = makeRepositories();
    await expect(registerAccount(repositories, INPUT, settingsFor("0"), ORIGIN)).rejects.toBeInstanceOf(
      SelfRegistrationDisabledError,
    );
    expect(created).toEqual([]);
  });

  it("mode 1 creates a registered account and mails an activation link, storing only its hash", async () => {
    const { repositories, created, tokens, jobs } = makeRepositories();
    const result = await registerAccount(repositories, INPUT, settingsFor("1"), ORIGIN);

    expect(result.kind).toBe("activation_email_sent");
    expect(created[0].status).toBe("registered");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].action).toBe("register");
    // The account is still `registered`, and dispatchJob only resolves *active* users — so a
    // mail addressed by user id would never be delivered and mode 1 could never complete.
    expect((jobs[0].payload as { recipientIds: string[]; recipientAddresses: string[] }).recipientIds).toEqual([]);
    expect((jobs[0].payload as { recipientAddresses: string[] }).recipientAddresses).toEqual(["newbie@example.com"]);

    const body = (jobs[0].payload as { body: string }).body;
    const mailedToken = body.match(/token=([0-9a-f]+)/)?.[1];
    expect(mailedToken).toBeTruthy();
    expect(hashUserToken(mailedToken!)).toBe(tokens[0].tokenHash);
  });

  it("mode 2 creates a registered account and notifies only the active administrators", async () => {
    const all = [
      makeUser({ id: "admin-1", mail: "admin1@example.com", isAdmin: true, status: "active" }),
      makeUser({ id: "admin-2", mail: "admin2@example.com", isAdmin: true, status: "locked" }),
      makeUser({ id: "plain", mail: "plain@example.com", isAdmin: false, status: "active" }),
    ];
    const { repositories, created, tokens, jobs } = makeRepositories({ all });
    const result = await registerAccount(repositories, INPUT, settingsFor("2"), ORIGIN);

    expect(result.kind).toBe("pending_admin_activation");
    expect(created[0].status).toBe("registered");
    expect(tokens).toEqual([]);
    // Addressed literally so an administrator with mail_notification = none still hears about
    // an account waiting on them; dispatchJob applies no preference filter to these.
    expect((jobs[0].payload as { recipientAddresses: string[] }).recipientAddresses).toEqual(["admin1@example.com"]);
  });

  it("mode 3 creates an already-active account and mails nothing", async () => {
    const { repositories, created, tokens, jobs } = makeRepositories();
    const result = await registerAccount(repositories, INPUT, settingsFor("3"), ORIGIN);

    expect(result.kind).toBe("activated");
    expect(created[0].status).toBe("active");
    expect(tokens).toEqual([]);
    expect(jobs).toEqual([]);
  });

  it("never lets a registrant grant themselves administrator", async () => {
    const { repositories, created } = makeRepositories();
    await registerAccount(repositories, { ...INPUT, ...({ isAdmin: true } as object) }, settingsFor("3"), ORIGIN);
    expect(created[0].isAdmin).toBe(false);
  });

  it("applies the configured password policy", async () => {
    const { repositories, created } = makeRepositories();
    const settings = { ...settingsFor("3"), passwordMinLength: 40 };
    await expect(registerAccount(repositories, INPUT, settings, ORIGIN)).rejects.toBeInstanceOf(RegistrationInputError);
    expect(created).toEqual([]);
  });

  it("rejects a login or an address already in use", async () => {
    const { repositories } = makeRepositories();
    repositories.userRepository.findByLogin = mock(async () => makeUser());
    await expect(registerAccount(repositories, INPUT, settingsFor("1"), ORIGIN)).rejects.toBeInstanceOf(RegistrationInputError);

    const second = makeRepositories();
    second.repositories.userRepository.findByMail = mock(async () => makeUser());
    await expect(registerAccount(second.repositories, INPUT, settingsFor("1"), ORIGIN)).rejects.toBeInstanceOf(
      RegistrationInputError,
    );
  });
});

describe("activateAccount", () => {
  const NOW = new Date("2026-01-01T12:00:00Z");

  function token(overrides: Partial<UserToken> = {}): UserToken {
    return {
      id: "token-1",
      userId: "user-1",
      action: "register",
      tokenHash: hashUserToken("raw"),
      expiresAt: new Date("2026-01-02T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...overrides,
    };
  }

  it("activates a registered account and consumes the link", async () => {
    const { repositories, statuses } = makeRepositories({ existing: makeUser({ status: "registered" }), token: token() });
    const result = await activateAccount(repositories, "raw", settingsFor("1"), NOW);

    expect(result.ok).toBe(true);
    expect(statuses).toEqual([{ userId: "user-1", status: "active" }]);
    expect(repositories.userTokenRepository.delete).toHaveBeenCalled();
  });

  it("refuses an expired link", async () => {
    const expired = token({ expiresAt: new Date("2025-12-31T00:00:00Z") });
    const { repositories, statuses } = makeRepositories({ existing: makeUser(), token: expired });
    expect(await activateAccount(repositories, "raw", settingsFor("1"), NOW)).toEqual({ ok: false });
    expect(statuses).toEqual([]);
  });

  it("refuses an unknown link", async () => {
    const { repositories, statuses } = makeRepositories({ existing: makeUser(), token: null });
    expect(await activateAccount(repositories, "raw", settingsFor("1"), NOW)).toEqual({ ok: false });
    expect(statuses).toEqual([]);
  });

  it("will not re-activate an account that is no longer merely registered — a replayed link must not unlock it", async () => {
    const { repositories, statuses } = makeRepositories({ existing: makeUser({ status: "locked" }), token: token() });
    expect(await activateAccount(repositories, "raw", settingsFor("1"), NOW)).toEqual({ ok: false });
    expect(statuses).toEqual([]);
  });

  it("refuses once self_registration has been switched off", async () => {
    const { repositories, statuses } = makeRepositories({ existing: makeUser(), token: token() });
    expect(await activateAccount(repositories, "raw", settingsFor("0"), NOW)).toEqual({ ok: false });
    expect(statuses).toEqual([]);
  });
});
