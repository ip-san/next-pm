import * as Sentry from "@sentry/node";
import { dispatchJob } from "@/application/jobs/dispatch-job";
import { loadSmtpConfigFromEnv } from "@/domain/mailer/smtp-config";
import type { Mailer } from "@/domain/mailer/port";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWebhookRepository } from "@/infrastructure/db/repositories/webhook-repository";
import { NodeWebhookSender } from "@/infrastructure/http/webhook-sender";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { DrizzleEmailAddressRepository } from "@/infrastructure/db/repositories/email-address-repository";
import { ConsoleMailer } from "@/infrastructure/mail/console-mailer";
import { NodemailerMailer } from "@/infrastructure/mail/nodemailer-mailer";
import { startHealthServer } from "./health-server";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: Boolean(process.env.SENTRY_DSN),
});

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 30000;

const jobRepository = new DrizzleJobRepository();
const smtpConfig = loadSmtpConfigFromEnv(process.env);
const mailer: Mailer = smtpConfig ? new NodemailerMailer(smtpConfig) : new ConsoleMailer();

/** Everything any job type might need; dispatchJob picks what the claimed job calls for. */
const handlers = {
  mailer,
  userRepository: new DrizzleUserRepository(),
  webhookRepository: new DrizzleWebhookRepository(),
  webhookSender: new NodeWebhookSender(),
  issueRepository: new DrizzleIssueRepository(),
  issueStatusRepository: new DrizzleIssueStatusRepository(),
  projectRepository: new DrizzleProjectRepository(),
  memberRepository: new DrizzleMemberRepository(),
  roleRepository: new DrizzleRoleRepository(),
  groupRepository: new DrizzleGroupRepository(),
  userPreferencesRepository: new DrizzleUserPreferencesRepository(),
  emailAddressRepository: new DrizzleEmailAddressRepository(),
};

/** Drains the queue until it's empty — the outer loop's sleep only kicks in once there's nothing left to claim. */
async function drainOnce() {
  for (;;) {
    const job = await jobRepository.claimNext();
    if (!job) {
      return;
    }
    try {
      await dispatchJob(handlers, job);
      await jobRepository.markDone(job.id);
    } catch (error) {
      Sentry.captureException(error);
      await jobRepository.markFailed(job.id, RETRY_DELAY_MS, MAX_ATTEMPTS);
    }
  }
}

async function main() {
  const healthPort = Number(process.env.WORKER_HEALTH_PORT) || 3001;
  startHealthServer(healthPort);
  for (;;) {
    try {
      await drainOnce();
    } catch (error) {
      // Jobs have no HTTP request to surface a failure through, so capture explicitly —
      // this is the one thing @sentry/nextjs's auto-instrumentation can't do for us here.
      Sentry.captureException(error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
