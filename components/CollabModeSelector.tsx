"use client";

import { useModelStore, useSettingsStore } from "@/lib/stores";
import type { CollaborationMode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ModeConfig {
  value: CollaborationMode;
  icon: string;
  label: string;
  tooltip: string;
  minModels: number;
  requiresWebSearch: boolean;
}

const COLLAB_MODES: ModeConfig[] = [
  {
    value: "debate",
    icon: "⚔",
    label: "Debate",
    tooltip:
      "Model A answers first, then Model B critiques and improves the response.",
    minModels: 2,
    requiresWebSearch: false,
  },
  {
    value: "chain",
    icon: "⛓",
    label: "Chain",
    tooltip:
      "Models refine sequentially: Drafter → Reviewer → Verifier (if 3 models enabled).",
    minModels: 2,
    requiresWebSearch: false,
  },
  {
    value: "research",
    icon: "🔬",
    label: "Research",
    tooltip:
      "Optionally injects web search results, then fans out to all enabled models simultaneously.",
    minModels: 1,
    requiresWebSearch: false,
  },
];

export function CollabModeSelector() {
  const { collaborationMode, setCollaborationMode, webSearchEnabled } =
    useSettingsStore();
  const { slots } = useModelStore();
  const enabledCount = slots.filter((s) => s.enabled).length;

  const toggle = (mode: CollaborationMode) => {
    setCollaborationMode(collaborationMode === mode ? "none" : mode);
  };

  return (
    <div className="flex items-center gap-1.5" aria-label="Collaboration mode">
      {COLLAB_MODES.map((cfg) => {
        const tooFewModels = enabledCount < cfg.minModels;
        const needsSearch = cfg.requiresWebSearch && !webSearchEnabled;
        const disabled = tooFewModels || needsSearch;
        const active = collaborationMode === cfg.value;

        let disabledReason = "";
        if (tooFewModels) disabledReason = `Requires ${cfg.minModels}+ models`;
        else if (needsSearch) disabledReason = "Enable Web Search first";

        return (
          <div key={cfg.value} className="relative group">
            <button
              type="button"
              disabled={disabled}
              onClick={() => !disabled && toggle(cfg.value)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 bg-background/60 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <span aria-hidden="true">{cfg.icon}</span>
              {cfg.label}
            </button>

            {/* Tooltip */}
            <div
              role="tooltip"
              className={cn(
                "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border/70 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100",
              )}
            >
              {disabled ? disabledReason : cfg.tooltip}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-border/70" />
            </div>
          </div>
        );
      })}

      {collaborationMode !== "none" && (
        <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          Collaboration active
        </span>
      )}
    </div>
  );
}
