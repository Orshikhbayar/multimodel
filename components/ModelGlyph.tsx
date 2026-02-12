"use client";

import type { ComponentType } from "react";
import {
  Code2,
  Cpu,
  Layers,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getModelGlyphKey, type ModelGlyphKey } from "@/lib/modelCatalog";

type ModelGlyphSize = "sm" | "md" | "lg";

type GlyphStyle =
  | {
      kind: "icon";
      container: string;
      icon: ComponentType<{ className?: string }>;
      iconClass?: string;
    }
  | {
      kind: "text";
      container: string;
      text: string;
      textClass: string;
    };

const SIZE_CLASSES: Record<ModelGlyphSize, string> = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-8 w-8",
};

const GLYPH_STYLES: Record<ModelGlyphKey, GlyphStyle> = {
  openai: {
    kind: "icon",
    container:
      "border-zinc-700 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-700 text-zinc-100",
    icon: Sparkles,
  },
  openaiCodex: {
    kind: "icon",
    container:
      "border-zinc-700 bg-gradient-to-br from-zinc-950 via-zinc-800 to-zinc-600 text-zinc-100",
    icon: Code2,
  },
  anthropic: {
    kind: "text",
    container: "border-[#c79f79] bg-[#d8b28e] text-zinc-900",
    text: "AI",
    textClass: "text-[10px] font-black leading-none tracking-tight",
  },
  google: {
    kind: "icon",
    container:
      "border-indigo-300/40 bg-gradient-to-br from-sky-500 via-indigo-500 to-cyan-300 text-white",
    icon: WandSparkles,
  },
  xai: {
    kind: "text",
    container:
      "border-slate-500/50 bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 text-slate-100",
    text: "x",
    textClass: "text-[11px] font-extrabold leading-none",
  },
  deepseek: {
    kind: "icon",
    container:
      "border-emerald-400/40 bg-gradient-to-br from-emerald-500 to-teal-700 text-emerald-50",
    icon: Cpu,
  },
  misc: {
    kind: "icon",
    container: "border-border bg-muted/60 text-muted-foreground",
    icon: Layers,
    iconClass: "h-3.5 w-3.5",
  },
};

export function ModelGlyph({
  modelId,
  providerId,
  size = "md",
  className,
}: {
  modelId?: string;
  providerId?: string;
  size?: ModelGlyphSize;
  className?: string;
}) {
  const glyph = GLYPH_STYLES[getModelGlyphKey(modelId, providerId)];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border shadow-sm",
        "transition-transform duration-150",
        SIZE_CLASSES[size],
        glyph.container,
        className,
      )}
      aria-hidden
    >
      {glyph.kind === "icon" ? (
        <glyph.icon className={cn("h-3.5 w-3.5", glyph.iconClass)} />
      ) : (
        <span className={glyph.textClass}>{glyph.text}</span>
      )}
    </span>
  );
}
