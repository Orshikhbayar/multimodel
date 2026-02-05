/**
 * Sentry Server Configuration
 * 
 * This file configures Sentry error tracking for the server.
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

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Only send errors in production by default
    enabled: process.env.NODE_ENV === "production",

    // Add additional context
    beforeSend(event, hint) {
      const error = hint.originalException;
      
      // Add error classification
      if (error instanceof Error) {
        event.tags = {
          ...event.tags,
          errorType: error.name,
        };
      }

      return event;
    },
  });
}
