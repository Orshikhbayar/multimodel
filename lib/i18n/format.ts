import { normalizeLocale } from "./locale";
import type { I18nLocale } from "./types";

export function toIntlLocale(locale: string): string {
  const normalized = normalizeLocale(locale) as I18nLocale;
  return normalized === "mn" ? "mn-MN" : "en-US";
}

export function formatDateByLocale(
  value: Date | number | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(toIntlLocale(locale), options);
}

export function formatTimeByLocale(
  value: Date | number | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString(toIntlLocale(locale), options);
}

export function formatDateTimeByLocale(
  value: Date | number | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(toIntlLocale(locale), options);
}

export function formatNumberByLocale(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

