import type { JobRepository } from "@/domain/job/repository";
import type { WebhookEvent } from "@/domain/webhook/events";
import type { WebhookRepository } from "@/domain/webhook/repository";

export const WEBHOOK_JOB_TYPE = "webhook";

export interface WebhookJobPayload {
  webhookId: string;
  /** Serialized at trigger time, exactly as Redmine stores it in the job. */
  body: string;
}

export interface TriggerWebhooksInput {
  event: WebhookEvent;
  projectId: string;
  timestamp: Date;
  /** The `data` member of the payload, e.g. `{ issue }`. */
  data: Record<string, unknown>;
  /**
   * Per-hook gate run as the hook's owner: can they see this object, and do they still hold
   * `use_webhooks` on this project? Mirrors the `object.visible?(hook.user) &&
   * hook.user.allowed_to?(:use_webhooks, object.project)` half of `Webhook.hooks_for`, which
   * can't live in the repository because it needs the authorization rules.
   */
  isDeliverableTo: (userId: string) => Promise<boolean>;
}

/**
 * Port of `Webhook.trigger`. The payload is built once per hook and frozen into the job, so a
 * later edit to the issue can't change what a pending delivery says — and so the delivery
 * worker never has to re-derive what the owner was allowed to see.
 *
 * Failures are swallowed: a webhook is an outbound side effect of a user action that has
 * already succeeded, and must never turn that action into an error.
 */
export async function triggerWebhooks(
  repositories: { webhookRepository: WebhookRepository; jobRepository: JobRepository },
  input: TriggerWebhooksInput,
): Promise<void> {
  const candidates = await repositories.webhookRepository.listCandidates(input.event, input.projectId);
  for (const hook of candidates) {
    if (!(await input.isDeliverableTo(hook.userId))) {
      continue;
    }
    const payload: WebhookJobPayload = {
      webhookId: hook.id,
      body: JSON.stringify({ type: input.event, timestamp: input.timestamp.toISOString(), data: input.data }),
    };
    await repositories.jobRepository.enqueue(WEBHOOK_JOB_TYPE, payload);
  }
}
