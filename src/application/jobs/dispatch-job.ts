import type { Job } from "@/domain/job/entity";
import type { Mailer } from "@/domain/mailer/port";
import type { UserRepository } from "@/domain/user/repository";

export class UnknownJobTypeError extends Error {}

export interface NotifyJobPayload {
  recipientIds: string[];
  subject: string;
  body: string;
}

/** Dispatches a claimed job to its handler. Currently only "notify" exists — Phase 7's scope. */
export async function dispatchJob(
  repositories: { mailer: Mailer; userRepository: UserRepository },
  job: Job,
): Promise<void> {
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
    default:
      throw new UnknownJobTypeError(`unknown job type: ${job.jobType}`);
  }
}
