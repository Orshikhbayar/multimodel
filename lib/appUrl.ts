function isHttpUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

export function getBrowserAppBaseUrl({
  configuredAppUrl,
  origin,
}: {
  configuredAppUrl?: string | null;
  origin?: string | null;
}) {
  if (isHttpUrl(configuredAppUrl)) {
    return configuredAppUrl!.trim();
  }

  if (isHttpUrl(origin)) {
    return origin!.trim();
  }

  return "http://localhost:3000";
}
