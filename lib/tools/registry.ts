import { assertValidSchema } from "@/lib/tools/schema";
import type { ToolDefinition } from "@/lib/tools/types";

function normalizeVersion(version: string): number[] {
  return version
    .split(".")
    .map((piece) => Number.parseInt(piece, 10))
    .map((value) => (Number.isFinite(value) ? value : 0));
}

function compareVersion(a: string, b: string): number {
  const left = normalizeVersion(a);
  const right = normalizeVersion(b);
  const max = Math.max(left.length, right.length);

  for (let index = 0; index < max; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;

    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

export class ToolRegistry {
  private readonly entries = new Map<string, Map<string, ToolDefinition>>();

  register(definition: ToolDefinition): void {
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(definition.tool_name)) {
      throw new Error(
        `Invalid tool_name '${definition.tool_name}'. Use snake_case only.`,
      );
    }

    assertValidSchema(definition.input_schema);
    assertValidSchema(definition.output_schema);

    const byVersion = this.entries.get(definition.tool_name) ?? new Map();
    byVersion.set(definition.tool_version, definition);
    this.entries.set(definition.tool_name, byVersion);
  }

  get(toolName: string, toolVersion?: string): ToolDefinition | null {
    const byVersion = this.entries.get(toolName);

    if (!byVersion) {
      return null;
    }

    if (toolVersion) {
      return byVersion.get(toolVersion) ?? null;
    }

    const versions = [...byVersion.keys()].sort(compareVersion);

    for (let index = versions.length - 1; index >= 0; index -= 1) {
      const definition = byVersion.get(versions[index]);

      if (definition && !definition.deprecated_at) {
        return definition;
      }
    }

    return byVersion.get(versions[versions.length - 1]) ?? null;
  }

  list(): ToolDefinition[] {
    const all: ToolDefinition[] = [];

    for (const byVersion of this.entries.values()) {
      all.push(...byVersion.values());
    }

    return all.sort((a, b) => {
      if (a.tool_name === b.tool_name) {
        return compareVersion(a.tool_version, b.tool_version);
      }
      return a.tool_name.localeCompare(b.tool_name);
    });
  }
}

const globalRegistry = new ToolRegistry();

export function getToolRegistry(): ToolRegistry {
  return globalRegistry;
}
