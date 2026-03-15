"use client";

import { useMemo } from "react";

import { useAppSettingsStore } from "@/lib/state/settingsStore";

import {
  formatDateByLocale,
  formatDateTimeByLocale,
  formatNumberByLocale,
  formatTimeByLocale,
} from "./format";
import { normalizeLocale } from "./locale";
import { t } from "./translate";
import type { I18nKey, I18nLocale, TranslationParams } from "./types";

export function useI18n() {
  const locale = useAppSettingsStore((state) => state.locale);
  const normalizedLocale = normalizeLocale(locale) as I18nLocale;

  return useMemo(
    () => ({
      locale: normalizedLocale,
      t: (key: I18nKey, params?: TranslationParams) =>
        t(normalizedLocale, key, params),
      formatDate: (
        value: Date | number | string,
        options?: Intl.DateTimeFormatOptions,
      ) => formatDateByLocale(value, normalizedLocale, options),
      formatTime: (
        value: Date | number | string,
        options?: Intl.DateTimeFormatOptions,
      ) => formatTimeByLocale(value, normalizedLocale, options),
      formatDateTime: (
        value: Date | number | string,
        options?: Intl.DateTimeFormatOptions,
      ) => formatDateTimeByLocale(value, normalizedLocale, options),
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumberByLocale(value, normalizedLocale, options),
    }),
    [normalizedLocale],
  );
}
