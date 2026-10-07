import { describe, expect, it, mock } from "bun:test";
import { triggerWebhooks, WEBHOOK_JOB_TYPE, type WebhookJobPayload } from "./trigger-webhooks";
import type { Webhook } from "@/domain/webhook/entity";
import type { WebhookRepository } from "@/domain/webhook/repository";
import type { JobRepository } from "@/domain/job/repository";

function makeHook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    id: "hook-1",
    userId: "user-1",
    url: "https://example.com/hook",
    secret: "",
    events: ["issue.created"],
    active: true,
    projectIds: ["project-1"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepositories(hooks: Webhook[]) {
  const enqueued: { jobType: string; payload: unknown }[] = [];
  const webhookRepository = {
    findById: mock(async () => null),
    listByUser: mock(async () => []),
    listCandidates: mock(async () => hooks),
    create: mock(async () => makeHook()),
    update: mock(async () => makeHook()),
    delete: mock(async () => {}),
  } satisfies WebhookRepository;
  const jobRepository = {
    enqueue: mock(async (jobType: string, payload: unknown) => {
      enqueued.push({ jobType, payload });
      return { id: "job", jobType, payload, status: "pending" as const, attempts: 0, availableAt: new Date(), createdAt: new Date() };
    }),
    claimNext: mock(async () => null),
    markDone: mock(async () => {}),
    markFailed: mock(async () => {}),
  } satisfies JobRepository;
  return { repositories: { webhookRepository, jobRepository }, enqueued };
}

const baseInput = {
  event: "issue.created" as const,
  projectId: "project-1",
  timestamp: new Date("2026-03-01T10:00:00.000Z"),
  data: { issue: { id: "issue-1" } },
};

describe("triggerWebhooks", () => {
  it("enqueues one job per candidate hook with a frozen payload", async () => {
    const { repositories, enqueued } = makeRepositories([makeHook(), makeHook({ id: "hook-2" })]);

    await triggerWebhooks(repositories, { ...baseInput, isDeliverableTo: async () => true });

    expect(enqueued).toHaveLength(2);
    expect(enqueued[0].jobType).toBe(WEBHOOK_JOB_TYPE);
    const payload = enqueued[0].payload as WebhookJobPayload;
    expect(payload.webhookId).toBe("hook-1");
    expect(JSON.parse(payload.body)).toEqual({
      type: "issue.created",
      timestamp: "2026-03-01T10:00:00.000Z",
      data: { issue: { id: "issue-1" } },
    });
  });

  it("skips a hook whose owner can't be delivered to", async () => {
    const { repositories, enqueued } = makeRepositories([makeHook(), makeHook({ id: "hook-2", userId: "user-2" })]);

    await triggerWebhooks(repositories, {
      ...baseInput,
      isDeliverableTo: async (userId) => userId === "user-2",
    });

    expect(enqueued).toHaveLength(1);
    expect((enqueued[0].payload as WebhookJobPayload).webhookId).toBe("hook-2");
  });

  it("enqueues nothing when no hook matches", async () => {
    const { repositories, enqueued } = makeRepositories([]);
    await triggerWebhooks(repositories, { ...baseInput, isDeliverableTo: async () => true });
    expect(enqueued).toEqual([]);
  });
});
