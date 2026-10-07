/**
 * The events a webhook can subscribe to, in Redmine's `type.action` spelling
 * (`WebhookPayload.register_model`). Redmine registers created/updated/deleted for Issue,
 * News, WikiPage, TimeEntry and Version; this list is deliberately only what next-pm actually
 * fires, because an event offered in the UI but never delivered is worse than one that isn't
 * offered at all. Deletions, time entries and versions are not here — see docs/parity-checklist.md.
 */
export const WEBHOOK_EVENTS = ["issue.created", "issue.updated", "news.created", "wiki_page.updated"] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "issue.created": "チケットの作成",
  "issue.updated": "チケットの更新",
  "news.created": "ニュースの作成",
  "wiki_page.updated": "Wikiページの更新",
};
