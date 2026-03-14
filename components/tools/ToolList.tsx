"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ToolRegistryEntry } from "@/components/tools/types";

interface ToolListProps {
  tools: ToolRegistryEntry[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedToolName?: string;
  onSelectTool: (tool: ToolRegistryEntry) => void;
}

export function ToolList({
  tools,
  search,
  onSearchChange,
  selectedToolName,
  onSelectTool,
}: ToolListProps) {
  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search tools by name or description"
      />
      <div className="space-y-2">
        {tools.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground">
            No tools match your search.
          </div>
        ) : null}

        {tools.map((tool) => {
          const isSelected = tool.tool_name === selectedToolName;

          return (
            <button
              key={`${tool.tool_name}:${tool.tool_version}`}
              type="button"
              onClick={() => onSelectTool(tool)}
              className={cn(
                "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border/70 hover:border-primary/60 hover:bg-muted/25",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {tool.tool_name}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      v{tool.tool_version}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
                {tool.requires_confirmation ? (
                  <Badge
                    variant="secondary"
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <ShieldAlert className="h-3 w-3" />
                    Write tool
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Read
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {tool.permissions.map((permission) => (
                  <Badge key={`${tool.tool_name}-${permission}`} variant="outline" className="text-[10px]">
                    {permission}
                  </Badge>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
