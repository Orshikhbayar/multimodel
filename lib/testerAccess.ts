function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Returns the set of user IDs that bypass rate limiting.
 * Populated via the UNLIMITED_TESTER_USER_IDS env var (comma-separated).
 * Use immutable user IDs — not emails, which users can change.
 */
export function getUnlimitedTesterUserIds(): string[] {
  return parseList(process.env.UNLIMITED_TESTER_USER_IDS);
}

/**
 * Returns true if the given Supabase user ID is a rate-limit bypass user.
 * This is the authoritative check — use it in checkStreamPermission.
 */
export function isUnlimitedTesterId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getUnlimitedTesterUserIds().includes(userId);
}

// ── Legacy email-based helpers ────────────────────────────────────────────
// Kept for backward compatibility with existing env vars.
// WARNING: email is a mutable field — a user can change it to gain bypass access.
// Migrate to UNLIMITED_TESTER_USER_IDS + isUnlimitedTesterId.

export function getUnlimitedTesterEmails(): string[] {
  const configured = parseList(process.env.UNLIMITED_TESTER_EMAILS).map(
    normalizeEmail,
  );
  const admin = normalizeEmail(process.env.ADMIN_EMAIL);
  const deduped = new Set<string>(configured);

  if (admin) {
    deduped.add(admin);
  }

  return [...deduped];
}

/** @deprecated Use isUnlimitedTesterId with a user_id instead. */
export function isUnlimitedTesterEmail(
  email: string | null | undefined,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getUnlimitedTesterEmails().includes(normalized);
}
