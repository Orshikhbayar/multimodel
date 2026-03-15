export const SUPPORTED_LOCALES = ["en", "mn"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function normalizeLocale(locale?: string | null): SupportedLocale {
  if (!locale) return DEFAULT_LOCALE;

  const trimmed = locale.trim().toLowerCase();
  if (SUPPORTED_LOCALE_SET.has(trimmed)) {
    return trimmed as SupportedLocale;
  }

  const baseLocale = trimmed.split("-")[0];
  if (SUPPORTED_LOCALE_SET.has(baseLocale)) {
    return baseLocale as SupportedLocale;
  }

  return DEFAULT_LOCALE;
}

export function getLocaleResponseInstruction(locale: string): string | null {
  const normalized = normalizeLocale(locale);

  if (normalized !== "mn") {
    return null;
  }

  return "Respond in Mongolian (Cyrillic) by default. Keep technical model names and code identifiers in English when clearer. If the user explicitly asks for another language, follow the user's request.";
}
