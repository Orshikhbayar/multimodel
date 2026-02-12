export type FxRateSnapshot = {
  usdToMnt: number;
  fetchedAtISO: string;
  source: string;
  live: boolean;
};

const FALLBACK_RATE = Number(process.env.NEXT_PUBLIC_USD_TO_MNT_RATE ?? "3568.5492");
const CACHE_TTL_MS = 15 * 60 * 1000;

let cached: {
  value: FxRateSnapshot;
  expiresAt: number;
} | null = null;

async function fetchFromOpenErApi(): Promise<FxRateSnapshot | null> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    cache: "no-store",
  });

  if (!response.ok) return null;

  const json = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };

  const rate = json.rates?.MNT;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const fetchedAt = json.time_last_update_utc
    ? new Date(json.time_last_update_utc)
    : new Date();

  return {
    usdToMnt: rate,
    fetchedAtISO: Number.isNaN(fetchedAt.getTime())
      ? new Date().toISOString()
      : fetchedAt.toISOString(),
    source: "open.er-api.com",
    live: true,
  };
}

async function fetchFromFrankfurter(): Promise<FxRateSnapshot | null> {
  const response = await fetch(
    "https://api.frankfurter.app/latest?from=USD&to=MNT",
    { cache: "no-store" },
  );

  if (!response.ok) return null;

  const json = (await response.json()) as {
    date?: string;
    rates?: Record<string, number>;
  };

  const rate = json.rates?.MNT;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const fetchedAt = json.date ? new Date(`${json.date}T00:00:00.000Z`) : new Date();

  return {
    usdToMnt: rate,
    fetchedAtISO: Number.isNaN(fetchedAt.getTime())
      ? new Date().toISOString()
      : fetchedAt.toISOString(),
    source: "api.frankfurter.app",
    live: true,
  };
}

function fallbackSnapshot(): FxRateSnapshot {
  return {
    usdToMnt: FALLBACK_RATE,
    fetchedAtISO: new Date().toISOString(),
    source: "fallback",
    live: false,
  };
}

export async function getUsdToMntRate(
  options: { forceRefresh?: boolean } = {},
): Promise<FxRateSnapshot> {
  const now = Date.now();

  if (!options.forceRefresh && cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const [primary, secondary] = await Promise.allSettled([
      fetchFromOpenErApi(),
      fetchFromFrankfurter(),
    ]);

    const resolvedPrimary =
      primary.status === "fulfilled" ? primary.value : null;
    const resolvedSecondary =
      secondary.status === "fulfilled" ? secondary.value : null;

    const liveRate = resolvedPrimary ?? resolvedSecondary;
    const snapshot = liveRate ?? fallbackSnapshot();

    cached = {
      value: snapshot,
      expiresAt: now + CACHE_TTL_MS,
    };

    return snapshot;
  } catch {
    const snapshot = fallbackSnapshot();
    cached = {
      value: snapshot,
      expiresAt: now + CACHE_TTL_MS,
    };
    return snapshot;
  }
}
