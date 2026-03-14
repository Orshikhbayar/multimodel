/**
 * Sentry Client Configuration
 * 
 * This file configures Sentry error tracking for the browser.
 * See: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Only initialize if DSN is configured
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Session Replay (captures user interactions for debugging)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Only send errors in production by default
    enabled: process.env.NODE_ENV === "production",

    // Filter out known non-actionable errors
    ignoreErrors: [
      // Network errors
      "Failed to fetch",
      "NetworkError",
      "Load failed",
      // User cancellations
      "AbortError",
      "The operation was aborted",
      // Browser extensions
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
    ],

    // Add user context when available
    beforeSend(event) {
      // Remove any sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      return event;
    },

    // Integrations
    integrations: [
      Sentry.replayIntegration({
        // Mask all text content by default for privacy
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
