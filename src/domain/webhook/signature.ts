import { createHmac } from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "x-redmine-signature-256";

/**
 * Same scheme as Redmine's `Webhook::Executor#compute_signature`, which follows GitHub's:
 * `sha256=` + the hex HMAC-SHA256 of the exact request body under the hook's secret. The
 * header name is kept as Redmine's so existing receivers verify next-pm's deliveries unchanged.
 */
export function computeWebhookSignature(secret: string, payload: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`;
}
