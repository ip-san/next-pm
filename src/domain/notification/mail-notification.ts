/**
 * Redmine's User#mail_notification values. next-pm computes a notification's recipients per
 * event (author / assignee / watchers / members) rather than from a project subscription list,
 * so only the two ends of Redmine's scale change anything here:
 *
 * - "all" means "do not filter", which is exactly next-pm's behaviour before this setting
 *   existed, and so is the default;
 * - "none" suppresses every notification for the account.
 *
 * The three middle options are stored and round-tripped by the my-account form (so a user's
 * choice is not silently discarded, and so the column matches Redmine's) but do not yet narrow
 * anything, because the recipient sets next-pm builds are already narrower than Redmine's
 * "everything in my projects". Wiring them properly belongs with the per-project notification
 * subscriptions in §11, which next-pm does not have.
 */
export const MAIL_NOTIFICATION_OPTIONS = [
  "all",
  "only_my_events",
  "only_assigned",
  "only_owner",
  "none",
] as const;

export type MailNotificationOption = (typeof MAIL_NOTIFICATION_OPTIONS)[number];

export const MAIL_NOTIFICATION_LABELS: Record<MailNotificationOption, string> = {
  all: "参加しているプロジェクトのすべての通知",
  only_my_events: "ウォッチ中または関係しているものだけ",
  only_assigned: "担当しているものだけ",
  only_owner: "自分が作成したものだけ",
  none: "通知しない",
};

export function wantsMail(option: MailNotificationOption): boolean {
  return option !== "none";
}

/**
 * Redmine's UserPreference#no_self_notified, applied at delivery time rather than when the
 * recipient list is built: the list is assembled by whichever use case raised the event, but
 * the preference belongs to each recipient, and only the job that is about to send knows them
 * all. Defaults to true (Redmine's default too), which is also next-pm's prior behaviour —
 * enqueueNotification used to drop the actor unconditionally.
 */
export function shouldNotifyRecipient(
  recipient: { userId: string; mailNotification: MailNotificationOption; noSelfNotified: boolean },
  actorUserId: string | null,
): boolean {
  if (!wantsMail(recipient.mailNotification)) {
    return false;
  }
  if (recipient.noSelfNotified && actorUserId !== null && recipient.userId === actorUserId) {
    return false;
  }
  return true;
}
