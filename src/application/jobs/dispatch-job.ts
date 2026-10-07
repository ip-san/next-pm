import type { Job } from "@/domain/job/entity";
import type { Mailer } from "@/domain/mailer/port";
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
  subject: string;
  body: string;
}

export interface DispatchJobRepositories extends Partial<RemindersRepositories> {
  mailer: Mailer;
  userRepository: UserRepository;
  /** Only the worker wires these; a caller that never enqueues webhooks can leave them out. */
  webhookRepository?: WebhookRepository;
  webhookSender?: WebhookSender;
}

/** Dispatches a claimed job to its handler. */
export async function dispatchJob(repositories: DispatchJobRepositories, job: Job): Promise<void> {
  switch (job.jobType) {
    case "notify": {
      const payload = job.payload as NotifyJobPayload;
      const users = await Promise.all(payload.recipientIds.map((id) => repositories.userRepository.findById(id)));
      const emails = users.filter((u): u is NonNullable<typeof u> => u !== null && u.status === "active").map((u) => u.mail);
      if (emails.length > 0) {
        await repositories.mailer.send({ to: emails, subject: payload.subject, body: payload.body });
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
