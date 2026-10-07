import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    // Attachment uploads go through Server Actions and the CSRF proxy. Both
    // default far below the 25 MB attachment_max_size default (1 MB and 10 MB),
    // so raise them with headroom for multipart overhead. The per-upload size
    // check against the admin setting still happens in the use case.
    serverActions: { bodySizeLimit: "26mb" },
    proxyClientMaxBodySize: "26mb",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
