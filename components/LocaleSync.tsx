"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/state/hooks";
import { normalizeLocale } from "@/lib/i18n/locale";

export function LocaleSync() {
  const { locale, reduceMotion } = useSettings();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = normalizeLocale(locale);
    }
  }, [locale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.reduceMotion = String(reduceMotion);
    }
  }, [reduceMotion]);

  return null;
}
