"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ChevronDown,
  Layers,
  Lock,
  Plus,
  Settings,
  Sparkles,
  Cloud,
  Brain,
  Flame,
  Cpu,
} from "lucide-react";

import {
  MODELS,
  PROVIDERS,
  type ProviderIconKey,
  getProviderById,
} from "@/lib/modelCatalog";
import { cn } from "@/lib/utils";

const PROVIDER_ICONS: Record<ProviderIconKey, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  brain: Brain,
  cloud: Cloud,
  flame: Flame,
  cpu: Cpu,
  layers: Layers,
};

export function ModelPicker({
  value,
  onChange,
  onOpenProviderSettings,
  trigger,
  lockedModelIds,
  onSelectLocked,
  popoverSide = "bottom",
  popoverAvoidCollisions = false,
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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selectedModel = MODELS.find((model) => model.id === value) ?? MODELS[0];
  const selectedProvider = getProviderById(selectedModel?.providerId ?? "") ?? PROVIDERS[0];

  const query = q.trim().toLowerCase();
  const isSearching = Boolean(query);

  const newModels = useMemo(
    () => MODELS.filter((model) => model.tags?.includes("new")),
    [],
  );

  const groupedProviders = useMemo(() => {
    return PROVIDERS.map((provider) => ({
      provider,
      models: MODELS.filter((model) => model.providerId === provider.id),
    })).filter((group) => group.models.length > 0);
  }, []);

  const searchResults = useMemo(() => {
    if (!query) return [];
    return MODELS.filter((model) =>
      model.label.toLowerCase().includes(query),
    );
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" className="gap-2">
            <span className="truncate">{selectedModel?.label ?? "Select model"}</span>
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
          maxHeight: "min(calc(100vh - 120px), var(--radix-popover-content-available-height))",
        }}
        className="w-[360px] max-w-[85vw] overflow-y-auto p-0 rounded-2xl border bg-card shadow-xl z-[9999]"
      >
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-2">
            <ProviderGlyph providerId={selectedProvider.id} />
            <div>
              <p className="text-sm font-semibold">{selectedModel?.label ?? "Model"}</p>
              <p className="text-xs text-muted-foreground">{selectedProvider?.name ?? ""}</p>
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
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search models..."
            className="h-9 text-sm"
          />
        </div>

        <ScrollArea className="h-[360px]">
          <div className="space-y-3 px-2 pb-2">
            {isSearching ? (
              searchResults.length > 0 ? (
                <ModelSection
                  title="Search results"
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
                  No models match your search.
                </div>
              )
            ) : (
              <>
                {newModels.length > 0 && (
                  <ModelSection
                    title="New models"
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
        </ScrollArea>

        <Separator />
        <button
          type="button"
          onClick={() => {
            onOpenProviderSettings?.(selectedProvider.id);
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-sm",
            "text-muted-foreground hover:bg-muted/40",
            !onOpenProviderSettings && "cursor-default",
          )}
        >
          <Settings className="h-4 w-4" />
          Manage models
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ProviderGlyph({ providerId }: { providerId: string }) {
  const provider = getProviderById(providerId);
  const Icon = provider?.icon ? PROVIDER_ICONS[provider.icon] : Layers;
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full border bg-muted/40">
      <Icon className="h-3.5 w-3.5" />
    </div>
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
  if (models.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {models.map((model) => {
          const provider = getProviderById(model.providerId);
          const active = model.id === activeId;
          const locked = lockedModelIds?.includes(model.id);
          return (
            <div
              key={model.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2 py-2",
                active ? "bg-muted/50" : "hover:bg-muted/40",
                locked && "opacity-70",
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
                title={locked ? "Upgrade to unlock this model" : undefined}
              >
                <ProviderGlyph providerId={provider?.id ?? ""} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{model.label}</span>
                    {locked ? (
                      <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Locked
                      </span>
                    ) : null}
                    {model.tags?.includes("new") ? (
                      <Badge variant="secondary" className="text-[10px]">
                        New
                      </Badge>
                    ) : null}
                  </div>
                  {model.description ? (
                    <p className="text-xs text-muted-foreground">{model.description}</p>
                  ) : null}
                </div>
              </button>
              <div className="flex items-center gap-2">
                {model.context ? (
                  <span className="text-[11px] text-muted-foreground">{model.context}</span>
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  variant={active ? "secondary" : "ghost"}
                  className={cn("h-7 w-7", locked && "opacity-60")}
                  onClick={() => {
                    if (locked) {
                      onSelectLocked?.(model.id);
                      return;
                    }
                    onSelect(model.id);
                  }}
                  aria-label={active ? "Selected" : "Select model"}
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
