function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parseUnlimitedTesterEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

export function getUnlimitedTesterEmails(): string[] {
  const configured = parseUnlimitedTesterEmails(process.env.UNLIMITED_TESTER_EMAILS);
  const admin = normalizeEmail(process.env.ADMIN_EMAIL);
  const deduped = new Set<string>(configured);

  if (admin) {
    deduped.add(admin);
  }

  return [...deduped];
}

export function isUnlimitedTesterEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getUnlimitedTesterEmails().includes(normalized);
}
