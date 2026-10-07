import type { WebhookEvent } from "./events";

export interface Webhook {
  id: string;
  /** Owner: the payload is built as this user, and only their visible data is sent. */
  userId: string;
  url: string;
  /** Empty means unsigned — Redmine's nullable `secret` column with the same meaning. */
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  projectIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const WEBHOOK_URL_MAX_LENGTH = 2000;
export const WEBHOOK_SECRET_MAX_LENGTH = 255;
