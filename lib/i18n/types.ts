import type { messages } from "./messages";

export type I18nLocale = "en" | "mn";

export type TranslationPrimitive = string | number | boolean | null | undefined;

export type TranslationParams = Record<string, TranslationPrimitive>;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;

type DotPath<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: DotPath<T[K], Join<Prefix, K>>;
    }[keyof T & string];

export type I18nKey = DotPath<(typeof messages)["en"]>;
