import { unionRecipients } from "@/domain/notification/recipients";
import type { JobRepository } from "@/domain/job/repository";
import type { NotifyJobPayload } from "./dispatch-job";
import type { IssueNotifyEvent } from "@/domain/notification/issue-tier";
import type { LocalizedMailText } from "@/domain/i18n/mail-text";

export interface EnqueueNotificationInput {
  recipientGroups: (string | null | undefined)[][];
  /**
   * Literal addresses to deliver to as well, for mail that is *about* an address rather than
   * to a user — "this address was removed from your account" has to reach the address that no
   * longer resolves from the user. Not filtered by any preference: these are security notices.
   */
  recipientAddresses?: string[];
  /**
   * Who caused the event. Previously this was applied here, by removing them from the
   * recipient list outright. It is now carried into the payload instead, because whether the
   * actor gets their own copy is *their* preference (no_self_notified) and only the job that
   * is about to send has read every recipient's preferences. The default of that preference is
   * true, so the observable behaviour is unchanged for anyone who has not opted in.
   */
  excludeUserId: string | null;
  /**
   * For an issue event: who the issue concerns, so the send step can apply each recipient's
   * mail_notification tier (Redmine's User#notify_about?). Omitted for other events, which then
   * aren't narrowed by tier.
   */
  issueEvent?: IssueNotifyEvent;
  subject: string;
  body: string;
  /** The text in every language (localizedMail); each recipient gets their own. Without it everyone gets subject/body. */
  localized?: LocalizedMailText;
  /** The language of whoever reads `recipientAddresses`, when that is one known user; otherwise the default language. */
  addressLanguage?: string | null;
}

/** Enqueues a "notify" job for the deduped recipient union, or does nothing if it would be empty. */
export async function enqueueNotification(
  repositories: { jobRepository: JobRepository },
  input: EnqueueNotificationInput,
): Promise<void> {
  const recipientIds = unionRecipients(input.recipientGroups, null);
  const recipientAddresses = input.recipientAddresses ?? [];
  if (recipientIds.length === 0 && recipientAddresses.length === 0) {
    return;
  }
  const payload: NotifyJobPayload = {
    recipientIds,
    recipientAddresses,
    actorUserId: input.excludeUserId,
    ...(input.issueEvent ? { issueEvent: input.issueEvent } : {}),
    subject: input.subject,
    body: input.body,
    ...(input.localized ? { localized: input.localized } : {}),
    ...(input.addressLanguage ? { addressLanguage: input.addressLanguage } : {}),
  };
  await repositories.jobRepository.enqueue("notify", payload);
}
