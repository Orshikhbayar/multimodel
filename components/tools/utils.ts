import type { JsonSchemaNode } from "@/components/tools/types";

export function truncateJson(value: unknown, maxChars = 1800): string {
  const raw = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();

  if (!raw) return "";
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(0, maxChars - 20))}\n... (truncated)`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function formatDuration(durationMs?: number | null): string {
  if (typeof durationMs !== "number" || durationMs < 0) return "-";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function formatCost(
  cost?: {
    total_tokens?: number;
    external_cost_usd?: number;
  } | null,
): string {
  if (!cost) return "-";

  const parts: string[] = [];
  if (typeof cost.total_tokens === "number") {
    parts.push(`${cost.total_tokens.toLocaleString()} tokens`);
  }
  if (typeof cost.external_cost_usd === "number") {
    parts.push(`$${cost.external_cost_usd.toFixed(4)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "-";
}

export function isToolWriteAction(requiresConfirmation: boolean): boolean {
  return requiresConfirmation;
}

export function schemaTypeIncludes(
  schema: JsonSchemaNode,
  expected: "string" | "number" | "integer" | "boolean" | "object" | "array",
): boolean {
  if (!schema.type) return false;
  if (typeof schema.type === "string") return schema.type === expected;
  return schema.type.includes(expected);
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  return !Array.isArray(value);
}

export function extractArtifactIds(value: unknown): string[] {
  const ids = new Set<string>();

  const walk = (current: unknown) => {
    if (Array.isArray(current)) {
      for (const item of current) {
        walk(item);
      }
      return;
    }

    if (!isPlainObject(current)) {
      return;
    }

    for (const [key, child] of Object.entries(current)) {
      if (
        key === "artifact_id" &&
        typeof child === "string" &&
        child.length > 0
      ) {
        ids.add(child);
      }
      walk(child);
    }
  };

  walk(value);
  return Array.from(ids);
}

export function extractSourceLinks(
  value: unknown,
): Array<{ title?: string; url: string }> {
  if (!isPlainObject(value)) return [];

  const citations = Array.isArray(value.citations) ? value.citations : [];
  const links = citations.reduce<Array<{ title?: string; url: string }>>(
    (acc, item) => {
      if (!isPlainObject(item)) return acc;
      const url = typeof item.url === "string" ? item.url : null;
      if (!url) return acc;
      const title = typeof item.title === "string" ? item.title : undefined;
      acc.push({ title, url });
      return acc;
    },
    [],
  );

  return links.slice(0, 10);
}
