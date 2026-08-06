import * as Sentry from "@sentry/node";
import { dispatchJob } from "@/application/jobs/dispatch-job";
import { loadSmtpConfigFromEnv } from "@/domain/mailer/smtp-config";
import type { Mailer } from "@/domain/mailer/port";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
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
const userRepository = new DrizzleUserRepository();
const smtpConfig = loadSmtpConfigFromEnv(process.env);
const mailer: Mailer = smtpConfig ? new NodemailerMailer(smtpConfig) : new ConsoleMailer();

/** Drains the queue until it's empty — the outer loop's sleep only kicks in once there's nothing left to claim. */
async function drainOnce() {
  for (;;) {
    const job = await jobRepository.claimNext();
    if (!job) {
      return;
    }
    try {
      await dispatchJob({ mailer, userRepository }, job);
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
