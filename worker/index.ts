import * as Sentry from "@sentry/node";
import { startHealthServer } from "./health-server";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: Boolean(process.env.SENTRY_DSN),
});

const POLL_INTERVAL_MS = 5000;

async function drainOnce() {
  // Phase 7 fills this in: dequeue jobs table rows via
  // `SELECT ... FOR UPDATE SKIP LOCKED` and dispatch to application/jobs/*.
}

async function main() {
  startHealthServer();
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
