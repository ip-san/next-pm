import type { Webhook } from "./entity";
import type { WebhookEvent } from "./events";

export interface WebhookInput {
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  projectIds: string[];
}

export interface WebhookRepository {
  findById(id: string): Promise<Webhook | null>;
  listByUser(userId: string): Promise<Webhook[]>;
  /**
   * Mirrors Redmine's `Webhook.hooks_for`: active hooks owned by an active user, subscribed to
   * `event`, and attached to `projectId`. Whether the owner may actually *see* the object is
   * decided by the caller, which has the visibility rules.
   */
  listCandidates(event: WebhookEvent, projectId: string): Promise<Webhook[]>;
  create(userId: string, input: WebhookInput): Promise<Webhook>;
  update(id: string, input: WebhookInput): Promise<Webhook>;
  delete(id: string): Promise<void>;
}
