export function getInitialFromName(input: string, fallback = "U") {
  if (!input) return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  return trimmed.charAt(0).toUpperCase();
}
