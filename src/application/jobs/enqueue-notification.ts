import { unionRecipients } from "@/domain/notification/recipients";
import type { JobRepository } from "@/domain/job/repository";
import type { NotifyJobPayload } from "./dispatch-job";

export interface EnqueueNotificationInput {
  recipientGroups: (string | null | undefined)[][];
  excludeUserId: string | null;
  subject: string;
  body: string;
}

/** Enqueues a "notify" job for the deduped recipient union, or does nothing if it would be empty. */
export async function enqueueNotification(
  repositories: { jobRepository: JobRepository },
  input: EnqueueNotificationInput,
): Promise<void> {
  const recipientIds = unionRecipients(input.recipientGroups, input.excludeUserId);
  if (recipientIds.length === 0) {
    return;
  }
  const payload: NotifyJobPayload = { recipientIds, subject: input.subject, body: input.body };
  await repositories.jobRepository.enqueue("notify", payload);
}
