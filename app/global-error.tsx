"use client";

/**
 * Global Error Boundary
 * 
 * Catches unhandled errors in the app and reports to Sentry.
 * This is the root error boundary for the entire application.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
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
              {t("errors.somethingWentWrong")}
            </h1>
            <p className="mb-6 text-muted-foreground">
              {t("errors.notifiedFixing")}
            </p>
            {error.digest && (
              <p className="mb-4 font-mono text-xs text-muted-foreground">
                {t("errors.errorId", { id: error.digest })}
              </p>
            )}
            <button
              onClick={reset}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              {t("errors.tryAgain")}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
