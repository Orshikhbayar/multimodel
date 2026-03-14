/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { URL } from "node:url";

import * as cheerio from "cheerio";

import { projectScopeKey } from "@/lib/tools/hash";
import type { ToolExecutionContext } from "@/lib/tools/types";

interface WebSearchInput {
  query: string;
  recency_days?: number;
  domains_allow?: string[];
  domains_deny?: string[];
  top_k?: number;
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  published_date?: string;
  ranking_score: number;
  canonical_url: string;
}

interface WebFetchInput {
  url: string;
  domains_allow?: string[];
  domains_deny?: string[];
}

interface WebFetchOutput {
  clean_text: string;
  headings: string[];
  metadata: {
    title?: string;
    description?: string;
    canonical_url?: string;
    language?: string;
    publisher?: string;
  };
  detected_date?: string;
  content_hash: string;
  word_count: number;
}

interface WebToolError extends Error {
  code: string;
  statusCode: number;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function createToolError(statusCode: number, code: string, message: string): WebToolError {
  const error = new Error(message) as WebToolError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function domainMatches(url: URL, domains: string[]): boolean {
  const host = normalizeDomain(url.hostname);
  const normalized = domains.map((domain) => normalizeDomain(domain));

  return normalized.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number.parseInt(part, 10);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = (value << 8) | octet;
  }

  return value >>> 0;
}

function ipv4InCidr(address: string, cidr: string): boolean {
  const [base, prefixRaw] = cidr.split("/");
  const prefix = Number.parseInt(prefixRaw, 10);
  const ip = parseIpv4(address);
  const network = parseIpv4(base);

  if (ip === null || network === null || !Number.isFinite(prefix)) {
    return false;
  }

  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  return (ip & mask) === (network & mask);
}

function parseIpv6(address: string): bigint | null {
  let value = address.toLowerCase();

  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon === -1) return null;

    const ipv4 = parseIpv4(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    const high = ((ipv4 >>> 16) & 0xffff).toString(16);
    const low = (ipv4 & 0xffff).toString(16);
    value = `${value.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];

  if (halves.length === 1 && left.length !== 8) return null;
  if (left.length + right.length > 8) return null;

  const fill = 8 - left.length - right.length;
  const pieces = [...left, ...new Array(fill).fill("0"), ...right];
  if (pieces.length !== 8) return null;

  let out = BigInt(0);
  for (const piece of pieces) {
    if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
    out = (out << BigInt(16)) + BigInt(`0x${piece}`);
  }

  return out;
}

function ipv6InCidr(address: string, cidr: string): boolean {
  const [base, prefixRaw] = cidr.split("/");
  const prefix = Number.parseInt(prefixRaw, 10);
  const ip = parseIpv6(address);
  const network = parseIpv6(base);

  if (ip === null || network === null || !Number.isFinite(prefix) || prefix < 0 || prefix > 128) {
    return false;
  }

  const shift = BigInt(128 - prefix);
  const ipPrefix = prefix === 0 ? BigInt(0) : ip >> shift;
  const networkPrefix = prefix === 0 ? BigInt(0) : network >> shift;
  return ipPrefix === networkPrefix;
}

function isBlockedIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked = [
      "0.0.0.0/8",
      "10.0.0.0/8",
      "100.64.0.0/10",
      "127.0.0.0/8",
      "169.254.0.0/16",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "198.18.0.0/15",
      "224.0.0.0/4",
      "240.0.0.0/4",
    ];
    return blocked.some((cidr) => ipv4InCidr(address, cidr));
  }

  if (family === 6) {
    const blocked = [
      "::/128",
      "::1/128",
      "fc00::/7",
      "fe80::/10",
      "ff00::/8",
      "2001:db8::/32",
    ];
    return blocked.some((cidr) => ipv6InCidr(address, cidr));
  }

  return true;
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const family = isIP(hostname);
  let addresses: string[];
  if (family > 0) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await dnsLookup(hostname, { all: true, verbatim: true })).map(
        (entry) => entry.address,
      );
    } catch {
      throw createToolError(400, "TOOL_INVALID_URL", "Could not resolve target host");
    }
  }

  if (!addresses.length) {
    throw createToolError(400, "TOOL_INVALID_URL", "Could not resolve target host");
  }

  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw createToolError(
        403,
        "TOOL_SSRF_BLOCKED",
        "Target resolves to a private, local, or reserved address",
      );
    }
  }

  return addresses;
}

async function checkSafeBrowsing(url: string, signal?: AbortSignal): Promise<boolean> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;

  if (!apiKey) {
    return true;
  }

  const response = await fetch(
    `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: {
          clientId: "multimodel-ai",
          clientVersion: "1.0.0",
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    return true;
  }

  const payload = (await response.json()) as { matches?: unknown[] };
  return !payload.matches || payload.matches.length === 0;
}

async function validateTargetUrl(
  rawUrl: string,
  domainsAllow?: string[],
  domainsDeny?: string[],
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw createToolError(400, "TOOL_INVALID_URL", "Invalid URL");
  }

  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    throw createToolError(400, "TOOL_INVALID_URL", "Only http/https URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw createToolError(400, "TOOL_INVALID_URL", "URL userinfo is not allowed");
  }

  if (domainsAllow?.length && !domainMatches(parsed, domainsAllow)) {
    throw createToolError(403, "TOOL_DOMAIN_NOT_ALLOWED", "URL domain is not in allow list");
  }

  if (domainsDeny?.length && domainMatches(parsed, domainsDeny)) {
    throw createToolError(403, "TOOL_DOMAIN_DENIED", "URL domain is in deny list");
  }

  await resolvePublicAddresses(parsed.hostname);
  return parsed;
}

function parsePublishedDate(rawSnippet: string): string | undefined {
  const isoMatch = rawSnippet.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const dateMatch = rawSnippet.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i,
  );

  if (!dateMatch) return undefined;

  const parsed = new Date(dateMatch[0]);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function htmlToText(value: string): {
  text: string;
  headings: string[];
  metadata: WebFetchOutput["metadata"];
  detectedDate?: string;
} {
  const $ = cheerio.load(value);

  $("script,style,noscript,iframe,svg").remove();

  const headings = $("h1, h2, h3")
    .map((_idx, node) => $(node).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, 50);

  const text = $("main").text() || $("article").text() || $("body").text();
  const normalizedText = text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const title = $("title").first().text().trim() || undefined;
  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    undefined;
  const canonicalUrl = $("link[rel='canonical']").attr("href") || undefined;
  const language = $("html").attr("lang") || undefined;
  const publisher = $("meta[property='og:site_name']").attr("content") || undefined;

  const published =
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='date']").attr("content") ||
    $("time").attr("datetime") ||
    undefined;

  let detectedDate: string | undefined;
  if (published) {
    const parsed = new Date(published);
    if (!Number.isNaN(parsed.getTime())) {
      detectedDate = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    text: normalizedText,
    headings,
    metadata: {
      title,
      description,
      canonical_url: canonicalUrl,
      language,
      publisher,
    },
    detectedDate,
  };
}

function buildQueryHash(input: WebSearchInput): string {
  return hashText(
    JSON.stringify({
      query: input.query,
      recency_days: input.recency_days ?? null,
      domains_allow: (input.domains_allow ?? []).map(normalizeDomain).sort(),
      domains_deny: (input.domains_deny ?? []).map(normalizeDomain).sort(),
      top_k: input.top_k ?? 8,
    }),
  );
}

function buildProviderQuery(input: WebSearchInput): string {
  if (!input.recency_days) {
    return input.query;
  }

  const currentYear = new Date().getUTCFullYear();
  if (input.recency_days <= 120) {
    return `${input.query} ${currentYear}`;
  }

  if (input.recency_days <= 730) {
    return `${input.query} ${currentYear} ${currentYear - 1}`;
  }

  return input.query;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function parseContentType(value: string | null): string {
  return (value ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

async function readHtmlWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createToolError(413, "TOOL_FETCH_TOO_LARGE", "Fetched page exceeds size limit");
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw createToolError(413, "TOOL_FETCH_TOO_LARGE", "Fetched page exceeds size limit");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw createToolError(413, "TOOL_FETCH_TOO_LARGE", "Fetched page exceeds size limit");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function fetchHtmlPage(
  input: WebFetchInput,
  signal?: AbortSignal,
): Promise<{ rawHtml: string; finalUrl: string; status: number }> {
  let currentUrl = input.url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const validatedUrl = await validateTargetUrl(
      currentUrl,
      input.domains_allow,
      input.domains_deny,
    );

    const safe = await checkSafeBrowsing(validatedUrl.toString(), signal);
    if (!safe) {
      throw createToolError(403, "TOOL_SAFE_BROWSING_BLOCKED", "URL failed safe browsing checks");
    }

    const response = await fetch(validatedUrl.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MultiModelAI/1.0; +https://multimodel-ai.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal,
    });

    if (isRedirectStatus(response.status)) {
      if (redirects >= MAX_REDIRECTS) {
        throw createToolError(400, "TOOL_TOO_MANY_REDIRECTS", "Too many redirects");
      }

      const location = response.headers.get("location");
      if (!location) {
        throw createToolError(400, "TOOL_REDIRECT_MISSING_LOCATION", "Redirect missing location");
      }

      currentUrl = new URL(location, validatedUrl.toString()).toString();
      continue;
    }

    if (!response.ok) {
      throw createToolError(502, "TOOL_FETCH_FAILED", `Failed to fetch URL (${response.status})`);
    }

    const contentType = parseContentType(response.headers.get("content-type"));
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw createToolError(
        415,
        "TOOL_UNSUPPORTED_CONTENT_TYPE",
        `Unsupported content type: ${contentType || "unknown"}`,
      );
    }

    const rawHtml = await readHtmlWithLimit(response, MAX_HTML_BYTES);
    return {
      rawHtml,
      finalUrl: validatedUrl.toString(),
      status: response.status,
    };
  }

  throw createToolError(400, "TOOL_TOO_MANY_REDIRECTS", "Too many redirects");
}

export async function webSearchTool(
  context: ToolExecutionContext,
  input: WebSearchInput,
): Promise<WebSearchResult[]> {
  const topK = Math.min(20, Math.max(1, input.top_k ?? 8));
  const queryHash = buildQueryHash(input);
  const scopeKey = projectScopeKey(context.projectId);
  const db = context.supabase as any;

  const { data: cacheHit, error: cacheReadError } = await db
    .from("web_search_cache")
    .select("results")
    .eq("workspace_id", context.workspaceId)
    .eq("project_scope_key", scopeKey)
    .eq("query_hash", queryHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cacheReadError) {
    throw new Error(`Failed to read web search cache: ${cacheReadError.message}`);
  }

  if (cacheHit?.results && Array.isArray(cacheHit.results)) {
    return (cacheHit.results as WebSearchResult[]).slice(0, topK);
  }

  const providerQuery = buildProviderQuery(input);
  const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(providerQuery)}`;
  const response = await fetch(ddgUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MultiModelAI/1.0; +https://multimodel-ai.vercel.app)",
    },
    signal: context.abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Search provider error (${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const candidates: Array<{ title: string; href: string; snippet: string; index: number }> = [];

  $(".result").each((index, element) => {
    if (candidates.length >= topK * 2) return;

    const titleEl = $(element).find(".result__title .result__a").first();
    const rawHref = titleEl.attr("href")?.trim();
    const title = titleEl.text().trim();
    const snippet = $(element).find(".result__snippet").first().text().trim() || "";

    if (!rawHref || !title) return;
    candidates.push({ title, href: rawHref, snippet, index });
  });

  const items: WebSearchResult[] = [];
  for (const candidate of candidates) {
    if (items.length >= topK) break;

    let finalUrl = candidate.href;
    try {
      const parsedHref = new URL(candidate.href, "https://duckduckgo.com");
      const uddg = parsedHref.searchParams.get("uddg");
      finalUrl = uddg ?? candidate.href;

      const validated = await validateTargetUrl(
        finalUrl,
        input.domains_allow,
        input.domains_deny,
      );

      items.push({
        title: candidate.title,
        url: validated.toString(),
        snippet: candidate.snippet,
        source: normalizeDomain(validated.hostname),
        published_date: parsePublishedDate(candidate.snippet),
        ranking_score: Number((1 - candidate.index * 0.05).toFixed(3)),
        canonical_url: normalizeUrl(validated.toString()),
      });
    } catch {
      // Ignore malformed or blocked URLs.
    }
  }

  const filtered = items.slice(0, topK);

  const { error: cacheError } = await db.from("web_search_cache").upsert(
    {
      workspace_id: context.workspaceId,
      project_id: context.projectId,
      query_hash: queryHash,
      query: input.query,
      params: {
        recency_days: input.recency_days ?? null,
        recency_mode: input.recency_days ? "best_effort_query_modifier" : "disabled",
        provider_query: providerQuery,
        domains_allow: input.domains_allow ?? [],
        domains_deny: input.domains_deny ?? [],
        top_k: topK,
      },
      results: filtered,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    {
      onConflict: "workspace_id,project_scope_key,query_hash",
    },
  );

  if (cacheError) {
    throw new Error(`Failed to cache web search: ${cacheError.message}`);
  }

  return filtered;
}

export async function webFetchTool(
  context: ToolExecutionContext,
  input: WebFetchInput,
): Promise<WebFetchOutput> {
  const validated = await validateTargetUrl(
    input.url,
    input.domains_allow,
    input.domains_deny,
  );
  const db = context.supabase as any;
  const scopeKey = projectScopeKey(context.projectId);
  const cacheLookupUrl = normalizeUrl(validated.toString());

  const { data: cached, error: cacheReadError } = await db
    .from("web_pages_cache")
    .select("clean_text, headings, metadata, detected_date, content_hash, word_count")
    .eq("workspace_id", context.workspaceId)
    .eq("project_scope_key", scopeKey)
    .eq("url", cacheLookupUrl)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cacheReadError) {
    throw new Error(`Failed to read fetched page cache: ${cacheReadError.message}`);
  }

  if (cached?.clean_text) {
    return {
      clean_text: cached.clean_text,
      headings: (cached.headings as string[]) ?? [],
      metadata: (cached.metadata as WebFetchOutput["metadata"]) ?? {},
      detected_date: cached.detected_date ?? undefined,
      content_hash: cached.content_hash,
      word_count: cached.word_count,
    };
  }

  const { rawHtml, finalUrl, status } = await fetchHtmlPage(input, context.abortSignal);
  const extracted = htmlToText(rawHtml);

  if (!extracted.text || extracted.text.length < 40) {
    throw createToolError(
      422,
      "TOOL_INSUFFICIENT_CONTENT",
      "Fetched page did not contain enough readable text",
    );
  }

  const wordCount = extracted.text.split(/\s+/).filter(Boolean).length;
  const contentHash = hashText(extracted.text);

  let canonical = cacheLookupUrl;
  if (extracted.metadata.canonical_url) {
    try {
      canonical = normalizeUrl(
        new URL(extracted.metadata.canonical_url, finalUrl).toString(),
      );
    } catch {
      canonical = cacheLookupUrl;
    }
  }

  const output: WebFetchOutput = {
    clean_text: extracted.text,
    headings: extracted.headings,
    metadata: {
      ...extracted.metadata,
      canonical_url: canonical,
    },
    detected_date: extracted.detectedDate,
    content_hash: contentHash,
    word_count: wordCount,
  };

  const { error: upsertError } = await db.from("web_pages_cache").upsert(
    {
      workspace_id: context.workspaceId,
      project_id: context.projectId,
      url: cacheLookupUrl,
      canonical_url: output.metadata.canonical_url ?? cacheLookupUrl,
      metadata: output.metadata,
      headings: output.headings,
      clean_text: output.clean_text,
      detected_date: output.detected_date ?? null,
      content_hash: contentHash,
      word_count: output.word_count,
      http_status: status,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
    },
    {
      onConflict: "workspace_id,project_scope_key,url",
    },
  );

  if (upsertError) {
    throw new Error(`Failed to cache fetched page: ${upsertError.message}`);
  }

  return output;
}
