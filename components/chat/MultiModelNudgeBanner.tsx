"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "multiModelNudgeDismissed";

interface MultiModelNudgeBannerProps {
  activeModelCount: number;
  onEnableMultiModel: () => void;
  className?: string;
}

export function MultiModelNudgeBanner({
  activeModelCount,
  onEnableMultiModel,
  className,
}: MultiModelNudgeBannerProps) {
  const { t } = useI18n();
  // Initialize as true (hidden) to avoid SSR flash; check sessionStorage after mount
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const checkDismissed = () =>
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === "true");
    checkDismissed();
  }, []);

  if (activeModelCount !== 1 || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm",
        className,
      )}
    >
      <span className="text-amber-800 dark:text-amber-200 min-w-0 truncate">
        ⚡ {t("chat.multiModelNudge")} —{" "}
        <button
          type="button"
          onClick={onEnableMultiModel}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          {t("chat.multiModelNudgeEnable")}
        </button>
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("accessibility.close")}
        className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
