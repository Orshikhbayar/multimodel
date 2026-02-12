import { messages } from "./messages";
import { normalizeLocale } from "./locale";
import type { I18nKey, I18nLocale, TranslationParams } from "./types";

function getPathValue(
  obj: unknown,
  path: string,
): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;

  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function t(
  locale: I18nLocale | string,
  key: I18nKey,
  params?: TranslationParams,
): string {
  const normalized = normalizeLocale(locale) as I18nLocale;
  const localized = getPathValue(messages[normalized], key);
  const fallback = getPathValue(messages.en, key);
  const value = localized ?? fallback ?? key;
  return interpolate(value, params);
}

