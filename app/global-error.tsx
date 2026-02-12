"use client";

/**
 * Global Error Boundary
 * 
 * Catches unhandled errors in the app and reports to Sentry.
 * This is the root error boundary for the entire application.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-2xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="mb-6 text-muted-foreground">
              We&apos;ve been notified and are working to fix the issue.
            </p>
            {error.digest && (
              <p className="mb-4 font-mono text-xs text-muted-foreground">
                Error ID: {error.digest}
              </p>
            )}
            <Button onClick={reset}>
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
