import { notifiedAddresses } from "@/domain/email-address/entity";
import type { EmailAddressRepository } from "@/domain/email-address/repository";
import type { Job } from "@/domain/job/entity";
import type { Mailer } from "@/domain/mailer/port";
import { shouldNotifyRecipient } from "@/domain/notification/mail-notification";
import { resolvePreferences } from "@/domain/user-preferences/entity";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { UserRepository } from "@/domain/user/repository";
import type { WebhookRepository } from "@/domain/webhook/repository";
import type { WebhookSender } from "@/domain/webhook/sender";
import { deliverWebhook } from "@/application/webhooks/deliver-webhook";
import { WEBHOOK_JOB_TYPE, type WebhookJobPayload } from "@/application/webhooks/trigger-webhooks";
import { sendReminders, REMINDERS_JOB_TYPE, type RemindersJobPayload } from "@/application/jobs/send-reminders";
import type { RemindersRepositories } from "@/application/jobs/send-reminders";

export class UnknownJobTypeError extends Error {}

export interface NotifyJobPayload {
  recipientIds: string[];
  /** Literal addresses, bypassing user resolution and preferences — see enqueue-notification.ts. */
  recipientAddresses?: string[];
  /** Whose action caused this; their own copy is suppressed unless they turned no_self_notified off. */
  actorUserId?: string | null;
  subject: string;
  body: string;
}

export interface DispatchJobRepositories extends Partial<RemindersRepositories> {
  mailer: Mailer;
  userRepository: UserRepository;
  userPreferencesRepository: UserPreferencesRepository;
  emailAddressRepository: EmailAddressRepository;
  /** Only the worker wires these; a caller that never enqueues webhooks can leave them out. */
  webhookRepository?: WebhookRepository;
  webhookSender?: WebhookSender;
}

/** Dispatches a claimed job to its handler. */
export async function dispatchJob(repositories: DispatchJobRepositories, job: Job): Promise<void> {
  switch (job.jobType) {
    case "notify": {
      const payload = job.payload as NotifyJobPayload;
      const users = (await repositories.userRepository.findByIds(payload.recipientIds)).filter(
        (user) => user.status === "active",
      );

      const preferences = await repositories.userPreferencesRepository.findByUserIds(users.map((user) => user.id));
      const preferencesByUser = new Map(preferences.map((preference) => [preference.userId, preference]));

      // Redmine's User#notified_users applies mail_notification and no_self_notified at send
      // time, and User#notified_mails then fans each recipient out to every address they
      // flagged notify — the default one plus any additional.
      const wanted = users.filter((user) => {
        const preference = resolvePreferences(preferencesByUser.get(user.id) ?? null, user.id);
        return shouldNotifyRecipient(
          { userId: user.id, mailNotification: user.mailNotification, noSelfNotified: preference.noSelfNotified },
          payload.actorUserId ?? null,
        );
      });

      const additional = await repositories.emailAddressRepository.listForUsers(wanted.map((user) => user.id));
      const emails = new Set<string>(payload.recipientAddresses ?? []);
      for (const user of wanted) {
        for (const address of notifiedAddresses(
          user.mail,
          additional.filter((entry) => entry.userId === user.id),
        )) {
          emails.add(address);
        }
      }

      if (emails.size > 0) {
        await repositories.mailer.send({ to: [...emails], subject: payload.subject, body: payload.body });
      }
      return;
    }
    case WEBHOOK_JOB_TYPE: {
      if (!repositories.webhookRepository || !repositories.webhookSender) {
        throw new UnknownJobTypeError("webhook delivery is not configured in this process");
      }
      await deliverWebhook(
        {
          webhookRepository: repositories.webhookRepository,
          userRepository: repositories.userRepository,
          webhookSender: repositories.webhookSender,
        },
        job.payload as WebhookJobPayload,
      );
      return;
    }
    case REMINDERS_JOB_TYPE: {
      const reminders = asRemindersRepositories(repositories);
      if (!reminders) {
        throw new UnknownJobTypeError("reminder delivery is not configured in this process");
      }
      await sendReminders(reminders, job.payload as RemindersJobPayload);
      return;
    }
    default:
      throw new UnknownJobTypeError(`unknown job type: ${job.jobType}`);
  }
}

function asRemindersRepositories(repositories: DispatchJobRepositories): RemindersRepositories | null {
  const { issueRepository, projectRepository, memberRepository, roleRepository, groupRepository, issueStatusRepository } =
    repositories;
  if (
    !issueRepository ||
    !projectRepository ||
    !memberRepository ||
    !roleRepository ||
    !groupRepository ||
    !issueStatusRepository
  ) {
    return null;
  }
  return {
    issueRepository,
    projectRepository,
    memberRepository,
    roleRepository,
    groupRepository,
    issueStatusRepository,
    userRepository: repositories.userRepository,
    mailer: repositories.mailer,
  };
}
