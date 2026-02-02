"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/state/hooks";

export function LocaleSync() {
  const { locale } = useSettings();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale || "en";
    }
  }, [locale]);

  return null;
}
