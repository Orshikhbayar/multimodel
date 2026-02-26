import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted = Object.keys(record).sort();
    const output: Record<string, unknown> = {};

    for (const key of sorted) {
      output[key] = canonicalize(record[key]);
    }

    return output;
  }

  return value ?? null;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}

export function projectScopeKey(projectId: string | null | undefined): string {
  return projectId ?? "**null**";
}
