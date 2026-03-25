"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, Lock, Plus, Search, Settings } from "lucide-react";

import { ModelGlyph } from "@/components/ModelGlyph";
import { MODELS, PROVIDERS, getProviderById } from "@/lib/modelCatalog";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { ModelTier } from "@/lib/modelCatalog";

const MODEL_DESCRIPTION_KEYS: Partial<Record<string, I18nKey>> = {
  "openai/gpt-5.2": "modelPicker.descGpt52",
  "openai/gpt-5.2-codex": "modelPicker.descGpt52Codex",
  "openai/gpt-5-mini": "modelPicker.descGpt5Mini",
  "openai/gpt-4.1": "modelPicker.descGpt41",
  "openai/gpt-5.1": "modelPicker.descGpt51",
  "anthropic/claude-opus-4.1": "modelPicker.descClaudeOpus41",
  "anthropic/claude-sonnet-4": "modelPicker.descClaudeSonnet4",
  "anthropic/claude-3.5": "modelPicker.descClaude35",
  "anthropic/claude-opus-4": "modelPicker.descClaudeOpus4",
  "google/gemini-3-pro-preview": "modelPicker.descGemini3Pro",
  "google/gemini-3-pro-image-preview": "modelPicker.descGemini3ProImage",
  "google/gemini-3-flash-preview": "modelPicker.descGemini3Flash",
  "google/gemini-2.5-flash": "modelPicker.descGemini25Flash",
  "google/gemini-2.0": "modelPicker.descGemini20",
  "xai/grok-4": "modelPicker.descGrok4",
  "deepseek/deepseek-chat": "modelPicker.descDeepSeekChat",
  "deepseek/deepseek-reasoner": "modelPicker.descDeepSeekReasoner",
  "xai/grok-3": "modelPicker.descGrok3",
};

const TIER_BADGE_STYLES: Record<ModelTier, string> = {
  free: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pro: "bg-primary/10 text-primary",
  premium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function ModelPicker({
  value,
  onChange,
  onOpenProviderSettings,
  trigger,
  lockedModelIds,
  onSelectLocked,
  popoverSide = "bottom",
  popoverAvoidCollisions = true,
  popoverAlign = "end",
  popoverSideOffset = 8,
  popoverCollisionPadding = 8,
}: {
  value: string;
  onChange: (modelId: string) => void;
  onOpenProviderSettings?: (providerId: string) => void;
  trigger?: React.ReactNode;
  lockedModelIds?: string[];
  onSelectLocked?: (modelId: string) => void;
  popoverSide?: "top" | "bottom" | "left" | "right";
  popoverAvoidCollisions?: boolean;
  popoverAlign?: "start" | "center" | "end";
  popoverSideOffset?: number;
  popoverCollisionPadding?: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = MODELS.find((model) => model.id === value) ?? MODELS[0];
  const selectedProvider =
    getProviderById(selectedModel?.providerId ?? "") ?? PROVIDERS[0];

  const query = q.trim().toLowerCase();
  const isSearching = Boolean(query);

  const newModels = useMemo(
    () => MODELS.filter((model) => model.tags?.includes("new")),
    [],
  );

  const groupedProviders = useMemo(() => {
    const newModelIdSet = new Set(newModels.map((model) => model.id));

    return PROVIDERS.map((provider) => ({
      provider,
      models: MODELS.filter(
        (model) =>
          model.providerId === provider.id && !newModelIdSet.has(model.id),
      ),
    })).filter((group) => group.models.length > 0);
  }, [newModels]);

  const searchResults = useMemo(() => {
    if (!query) return [];
    return MODELS.filter((model) => {
      const descriptionKey = MODEL_DESCRIPTION_KEYS[model.id];
      const description = descriptionKey
        ? t(descriptionKey)
        : model.description;
      return [model.label, description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [query, t]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" className="gap-2">
            <span className="truncate">
              {selectedModel?.label ?? t("topBar.selectModel")}
            </span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={popoverAlign}
        side={popoverSide}
        sideOffset={popoverSideOffset}
        avoidCollisions={popoverAvoidCollisions}
        collisionPadding={popoverCollisionPadding}
        style={{
          maxHeight:
            "min(calc(100vh - 120px), var(--radix-popover-content-available-height))",
        }}
        className="z-[9999] flex w-[380px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border bg-card/95 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-2">
            <ModelGlyph
              modelId={selectedModel?.id}
              providerId={selectedProvider.id}
              size="lg"
            />
            <div>
              <p className="text-sm font-semibold">
                {selectedModel?.label ?? t("topBar.model")}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedProvider?.name ?? ""}
              </p>
            </div>
          </div>
          {selectedModel?.context ? (
            <span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
              {selectedModel.context}
            </span>
          ) : null}
        </div>

        <Separator />

        <div className="p-2">
          <p className="px-1 pb-2 text-[11px] text-muted-foreground">
            {t("modelPicker.tip")}
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("modelPicker.searchModels")}
              className="h-9 border-border/60 bg-background/70 pl-8 text-sm transition-colors focus-visible:border-primary/60"
            />
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ maxHeight: "min(360px, 50vh)" }}
        >
          <div className="space-y-3 px-2 pb-2">
            {isSearching ? (
              searchResults.length > 0 ? (
                <ModelSection
                  title={t("modelPicker.searchResults")}
                  models={searchResults}
                  activeId={selectedModel?.id}
                  lockedModelIds={lockedModelIds}
                  onSelect={(modelId) => {
                    onChange(modelId);
                    setOpen(false);
                  }}
                  onSelectLocked={(modelId) => {
                    onSelectLocked?.(modelId);
                    setOpen(false);
                  }}
                />
              ) : (
                <div className="rounded-lg border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                  {t("modelPicker.noModelsMatch")}
                </div>
              )
            ) : (
              <>
                {newModels.length > 0 && (
                  <ModelSection
                    title={t("modelPicker.newModels")}
                    models={newModels}
                    activeId={selectedModel?.id}
                    lockedModelIds={lockedModelIds}
                    onSelect={(modelId) => {
                      onChange(modelId);
                      setOpen(false);
                    }}
                    onSelectLocked={(modelId) => {
                      onSelectLocked?.(modelId);
                      setOpen(false);
                    }}
                  />
                )}

                {groupedProviders.map((group) => (
                  <ModelSection
                    key={group.provider.id}
                    title={group.provider.name}
                    models={group.models}
                    activeId={selectedModel?.id}
                    lockedModelIds={lockedModelIds}
                    onSelect={(modelId) => {
                      onChange(modelId);
                      setOpen(false);
                    }}
                    onSelectLocked={(modelId) => {
                      onSelectLocked?.(modelId);
                      setOpen(false);
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {onOpenProviderSettings ? (
          <>
            <Separator />
            <button
              type="button"
              onClick={() => {
                onOpenProviderSettings(selectedProvider.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground",
                "transition-colors duration-150 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <Settings className="h-4 w-4" />
              {t("modelPicker.manageModels")}
            </button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ModelSection({
  title,
  models,
  activeId,
  onSelect,
  lockedModelIds,
  onSelectLocked,
}: {
  title: string;
  models: typeof MODELS;
  activeId?: string;
  onSelect: (modelId: string) => void;
  lockedModelIds?: string[];
  onSelectLocked?: (modelId: string) => void;
}) {
  const { t } = useI18n();
  if (models.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {models.map((model) => {
          const active = model.id === activeId;
          const locked = lockedModelIds?.includes(model.id);
          const descriptionKey = MODEL_DESCRIPTION_KEYS[model.id];
          const description = descriptionKey
            ? t(descriptionKey)
            : model.description;
          return (
            <div
              key={model.id}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-xl border px-2 py-2",
                "transition-all duration-150",
                active
                  ? "border-border bg-muted/60"
                  : "border-transparent hover:border-border/60 hover:bg-muted/40",
                locked && "opacity-75",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (locked) {
                    onSelectLocked?.(model.id);
                    return;
                  }
                  onSelect(model.id);
                }}
                className={cn(
                  "flex flex-1 items-center gap-2 text-left",
                  locked && "cursor-not-allowed",
                )}
                aria-disabled={locked}
                title={locked ? t("modelPicker.upgradeToUnlock") : undefined}
              >
                <ModelGlyph modelId={model.id} providerId={model.providerId} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {model.label}
                    </span>
                    {locked ? (
                      <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        {t("modelPicker.locked")}
                      </span>
                    ) : null}
                    {model.tags?.includes("new") ? (
                      <Badge
                        variant="muted"
                        className="border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-500 dark:text-emerald-400"
                      >
                        {t("navigation.new")}
                      </Badge>
                    ) : null}
                    {model.tier && model.tier !== "free" ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                          TIER_BADGE_STYLES[model.tier],
                        )}
                      >
                        {model.tier}
                      </span>
                    ) : null}
                  </div>
                  {description ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </div>
              </button>
              <div className="flex items-center gap-2">
                {model.context ? (
                  <span className="text-[11px] text-muted-foreground">
                    {model.context}
                  </span>
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  variant={active ? "secondary" : "ghost"}
                  className={cn(
                    "h-7 w-7 transition-all duration-150 group-hover:scale-[1.03]",
                    locked && "opacity-60",
                  )}
                  onClick={() => {
                    if (locked) {
                      onSelectLocked?.(model.id);
                      return;
                    }
                    onSelect(model.id);
                  }}
                  aria-label={
                    active
                      ? t("modelPicker.selected")
                      : t("modelPicker.selectModelAria")
                  }
                  aria-disabled={locked}
                >
                  {locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
