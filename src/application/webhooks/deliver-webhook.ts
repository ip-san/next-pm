import type { UserRepository } from "@/domain/user/repository";
import type { WebhookRepository } from "@/domain/webhook/repository";
import type { WebhookSender } from "@/domain/webhook/sender";
import type { WebhookJobPayload } from "./trigger-webhooks";

export class WebhookDeliveryError extends Error {}

/**
 * The "webhook" job handler, matching Redmine's `WebhookJob#perform`: re-read the hook, give
 * up quietly if it or its owner went away, otherwise POST the frozen payload.
 *
 * Unlike Redmine — which never retries — a retryable failure throws, so the worker's existing
 * backoff applies. "Retryable" is deliberately narrow: a 5xx, a timeout or a transport error
 * may succeed later, but a 4xx, a redirect or a URL that now resolves to a blocked address
 * never will, and re-sending those would only keep a dead hook hammering an endpoint.
 */
export async function deliverWebhook(
  repositories: { webhookRepository: WebhookRepository; userRepository: UserRepository; webhookSender: WebhookSender },
  payload: WebhookJobPayload,
): Promise<void> {
  const hook = await repositories.webhookRepository.findById(payload.webhookId);
  if (!hook || !hook.active) {
    return;
  }
  const owner = await repositories.userRepository.findById(hook.userId);
  if (!owner || owner.status !== "active") {
    return;
  }

  const result = await repositories.webhookSender.send(hook.url, payload.body, hook.secret);
  if (!result.ok && result.retryable) {
    throw new WebhookDeliveryError(`webhook ${hook.id} delivery failed: ${result.reason}`);
  }
}
