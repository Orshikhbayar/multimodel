/**
 * Sentry Edge Configuration
 *
 * This file configures Sentry for Edge runtime (middleware, edge API routes).
 * See: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;

// Only initialize if DSN is configured
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV,

    // Performance Monitoring (lower for edge to reduce overhead)
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0.5,

    // Only send errors in production
    enabled: process.env.NODE_ENV === "production",
  });
}
