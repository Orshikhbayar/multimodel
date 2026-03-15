"use client";

import Image from "next/image";
import type { ComponentType } from "react";
import { Code2, Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import { getModelGlyphKey, type ModelGlyphKey } from "@/lib/modelCatalog";

type ModelGlyphSize = "sm" | "md" | "lg";

type GlyphStyle =
  | {
      kind: "logo";
      container: string;
      src: string;
      imageClass?: string;
      codexBadge?: boolean;
    }
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
    kind: "logo",
    container: "border-zinc-300 bg-white text-zinc-900",
    src: "/model-logos/openai.svg",
  },
  openaiCodex: {
    kind: "logo",
    container: "border-zinc-300 bg-white text-zinc-900",
    src: "/model-logos/openai.svg",
    codexBadge: true,
  },
  anthropic: {
    kind: "logo",
    container: "border-[#edc9af] bg-white",
    src: "/model-logos/claude.svg",
    imageClass: "h-[72%] w-[72%]",
  },
  google: {
    kind: "logo",
    container: "border-zinc-300 bg-white",
    src: "/model-logos/gemini.svg",
  },
  xai: {
    kind: "logo",
    container: "border-zinc-300 bg-white text-zinc-900",
    src: "/model-logos/grok.svg",
  },
  deepseek: {
    kind: "logo",
    container: "border-[#9aabff] bg-white",
    src: "/model-logos/deepseek.svg",
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
        "relative inline-flex shrink-0 items-center justify-center rounded-full border shadow-sm",
        "transition-transform duration-150",
        SIZE_CLASSES[size],
        glyph.container,
        className,
      )}
      aria-hidden
    >
      {glyph.kind === "logo" ? (
        <>
          <span className={cn("relative h-[68%] w-[68%]", glyph.imageClass)}>
            <Image
              src={glyph.src}
              alt=""
              fill
              sizes="32px"
              className="object-contain"
              draggable={false}
            />
          </span>
          {glyph.codexBadge ? (
            <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-800">
              <Code2 className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </>
      ) : glyph.kind === "icon" ? (
        <glyph.icon className={cn("h-3.5 w-3.5", glyph.iconClass)} />
      ) : (
        <span className={glyph.textClass}>{glyph.text}</span>
      )}
    </span>
  );
}
