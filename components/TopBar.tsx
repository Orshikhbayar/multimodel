"use client";

import {
  Brain,
  ChevronDown,
  Cloud,
  Cpu,
  Flame,
  Layers,
  Plus,
  Settings,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelPicker } from "@/components/ModelPicker";
import type { ModelSlot } from "@/lib/types";
import {
  getProviderById,
  type ProviderIconKey,
  MODELS,
} from "@/lib/modelCatalog";
import { cn } from "@/lib/utils";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";

const PROVIDER_ICONS: Record<
  ProviderIconKey,
  React.ComponentType<{ className?: string }>
> = {
  sparkles: Sparkles,
  brain: Brain,
  cloud: Cloud,
  flame: Flame,
  cpu: Cpu,
  layers: Layers,
};

interface TopBarProps {
  title: string;
  activeSlot?: ModelSlot;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onSelectModel: (modelId: string) => void;
}

export function TopBar({
  title,
  activeSlot,
  onNewChat,
  onOpenSettings,
  onSelectModel,
}: TopBarProps) {
  const { currentPlanId, openUpgradeModal } = useBillingStore();
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);
  return (
    <div className="flex items-center justify-between gap-4 border-b bg-card/70 px-4 py-3 backdrop-blur">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Current chat
        </p>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {activeSlot ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  activeSlot.status === "streaming"
                    ? "bg-amber-400"
                    : activeSlot.status === "error"
                      ? "bg-destructive"
                      : "bg-emerald-400",
                )}
              />
              {activeSlot.status}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" title="Star chat">
          <Star className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Quick action">
          <Zap className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
        <ModelPicker
          value={activeSlot?.modelId ?? "openai/gpt-4.1"}
          onChange={onSelectModel}
          lockedModelIds={lockedModelIds}
          onSelectLocked={(modelId) =>
            openUpgradeModal({
              reason: "This model is available on higher tiers.",
              lockedModelId: modelId,
            })
          }
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm transition hover:bg-muted/40"
            >
              <ProviderGlyph providerId={activeSlot?.providerId} />
              <span className="max-w-[160px] truncate font-semibold">
                {activeSlot?.label ?? "Select model"}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Open settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ProviderGlyph({ providerId }: { providerId?: string }) {
  const provider = providerId ? getProviderById(providerId) : undefined;
  const Icon = provider?.icon ? PROVIDER_ICONS[provider.icon] : Layers;
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border bg-muted/40">
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
