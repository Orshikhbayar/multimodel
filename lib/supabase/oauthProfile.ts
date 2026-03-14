import type { User } from "@supabase/supabase-js";

const REQUIRED_AVATAR_PROVIDERS = ["google", "github"] as const;

export type RequiredAvatarProvider = (typeof REQUIRED_AVATAR_PROVIDERS)[number];

type SupabaseAuthUser = Pick<
  User,
  "app_metadata" | "user_metadata" | "identities"
>;
type AnyObject = Record<string, unknown>;

function isRequiredAvatarProvider(
  value: string,
): value is RequiredAvatarProvider {
  return (REQUIRED_AVATAR_PROVIDERS as readonly string[]).includes(value);
}

function toRecord(value: unknown): AnyObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AnyObject;
}

function getString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => getString(entry))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => entry.toLowerCase());
}

function normalizeHttpUrl(value: unknown): string | null {
  const candidate = getString(value);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readAvatarFromRecord(record: AnyObject | null): string | null {
  if (!record) {
    return null;
  }

  const keys = ["avatar_url", "picture", "avatarUrl", "photoURL"];
  for (const key of keys) {
    const url = normalizeHttpUrl(record[key]);
    if (url) {
      return url;
    }
  }
  return null;
}

function getProviderFromIdentity(value: unknown): string | null {
  const identity = toRecord(value);
  return getString(identity?.provider)?.toLowerCase() ?? null;
}

export function getOAuthProviderRequiringAvatar(
  user: SupabaseAuthUser,
): RequiredAvatarProvider | null {
  const appMetadata = toRecord(user.app_metadata);
  const provider = getString(appMetadata?.provider)?.toLowerCase();
  if (provider && isRequiredAvatarProvider(provider)) {
    return provider;
  }

  const providers = getStringArray(appMetadata?.providers);
  const providerFromArray = providers.find((entry) =>
    isRequiredAvatarProvider(entry),
  );
  if (providerFromArray) {
    return providerFromArray;
  }

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const identityProvider = getProviderFromIdentity(identity);
      if (identityProvider && isRequiredAvatarProvider(identityProvider)) {
        return identityProvider;
      }
    }
  }

  return null;
}

export function extractOAuthAvatarUrl(
  user: SupabaseAuthUser,
  provider?: string | null,
): string | null {
  const targetProvider = getString(provider)?.toLowerCase();
  const identities = Array.isArray(user.identities) ? user.identities : [];

  if (targetProvider) {
    for (const value of identities) {
      const identity = toRecord(value);
      const identityProvider = getString(identity?.provider)?.toLowerCase();
      if (identityProvider !== targetProvider) {
        continue;
      }

      const identityData = toRecord(identity?.identity_data);
      const identityAvatar = readAvatarFromRecord(identityData);
      if (identityAvatar) {
        return identityAvatar;
      }
    }
  }

  const userMetadata = toRecord(user.user_metadata);
  const metadataAvatar = readAvatarFromRecord(userMetadata);
  if (metadataAvatar) {
    return metadataAvatar;
  }

  for (const value of identities) {
    const identity = toRecord(value);
    const identityData = toRecord(identity?.identity_data);
    const identityAvatar = readAvatarFromRecord(identityData);
    if (identityAvatar) {
      return identityAvatar;
    }
  }

  return null;
}
