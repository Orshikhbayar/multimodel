"use client";

import { useI18n } from "@/lib/i18n";

/**
 * Skip navigation link for accessibility
 * Hidden by default, appears on focus for keyboard users
 */
export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  const { t } = useI18n();

  return (
    <a
      href={`#${targetId}`}
      className="
        sr-only
        focus:not-sr-only
        focus:fixed
        focus:left-4
        focus:top-4
        focus:z-[100]
        focus:rounded-lg
        focus:bg-primary
        focus:px-4
        focus:py-2
        focus:text-sm
        focus:font-medium
        focus:text-primary-foreground
        focus:shadow-lg
        focus:outline-none
        focus:ring-2
        focus:ring-ring
        focus:ring-offset-2
      "
    >
      {t("accessibility.skipToMainContent")}
    </a>
  );
}
