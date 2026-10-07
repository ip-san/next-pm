export type WebhookDeliveryResult =
  | { ok: true; status: number }
  | {
      ok: false;
      /** True only for failures a later attempt could plausibly survive (5xx, timeout, network). */
      retryable: boolean;
      reason: string;
      status?: number;
    };

/** Outbound port for webhook delivery — see infrastructure/http/webhook-sender.ts. */
export interface WebhookSender {
  send(url: string, payload: string, secret: string): Promise<WebhookDeliveryResult>;
}
