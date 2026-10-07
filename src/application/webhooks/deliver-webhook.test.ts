import { describe, expect, it, mock } from "bun:test";
import { deliverWebhook, WebhookDeliveryError } from "./deliver-webhook";
import type { Webhook } from "@/domain/webhook/entity";
import type { WebhookRepository } from "@/domain/webhook/repository";
import type { WebhookDeliveryResult, WebhookSender } from "@/domain/webhook/sender";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function makeHook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: "hook-1",
    userId: "user-1",
    url: "https://example.com/hook",
    secret: "s3cret",
    events: ["issue.created"],
    active: true,
    projectIds: ["project-1"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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
    atomKey: null,
    authSource: null,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
    ...overrides,
  };
}

function makeRepositories(options: { hook: Webhook | null; user: User | null; result: WebhookDeliveryResult }) {
  const sent: { url: string; body: string; secret: string }[] = [];
  return {
    sent,
    repositories: {
      webhookRepository: { findById: mock(async () => options.hook) } as unknown as WebhookRepository,
      userRepository: { findById: mock(async () => options.user) } as unknown as UserRepository,
      webhookSender: {
        send: mock(async (url: string, body: string, secret: string) => {
          sent.push({ url, body, secret });
          return options.result;
        }),
      } satisfies WebhookSender,
    },
  };
}

const payload = { webhookId: "hook-1", body: '{"type":"issue.created"}' };

describe("deliverWebhook", () => {
  it("posts the frozen payload to the hook's url", async () => {
    const { repositories, sent } = makeRepositories({
      hook: makeHook(),
      user: makeUser(),
      result: { ok: true, status: 200 },
    });

    await deliverWebhook(repositories, payload);

    expect(sent).toEqual([{ url: "https://example.com/hook", body: payload.body, secret: "s3cret" }]);
  });

  it("does nothing when the hook is gone or deactivated", async () => {
    for (const hook of [null, makeHook({ active: false })]) {
      const { repositories, sent } = makeRepositories({ hook, user: makeUser(), result: { ok: true, status: 200 } });
      await deliverWebhook(repositories, payload);
      expect(sent).toEqual([]);
    }
  });

  it("does nothing when the owner is no longer active", async () => {
    const { repositories, sent } = makeRepositories({
      hook: makeHook(),
      user: makeUser({ status: "locked" }),
      result: { ok: true, status: 200 },
    });
    await deliverWebhook(repositories, payload);
    expect(sent).toEqual([]);
  });

  it("throws for a retryable failure so the worker backs off and tries again", async () => {
    const { repositories } = makeRepositories({
      hook: makeHook(),
      user: makeUser(),
      result: { ok: false, retryable: true, reason: "http_503", status: 503 },
    });
    await expect(deliverWebhook(repositories, payload)).rejects.toBeInstanceOf(WebhookDeliveryError);
  });

  it("gives up quietly on a failure no retry could fix", async () => {
    for (const reason of ["http_404", "blocked_address", "http_302"]) {
      const { repositories } = makeRepositories({
        hook: makeHook(),
        user: makeUser(),
        result: { ok: false, retryable: false, reason },
      });
      await expect(deliverWebhook(repositories, payload)).resolves.toBeUndefined();
    }
  });
});
