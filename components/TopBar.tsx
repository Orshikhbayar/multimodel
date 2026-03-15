"use client";

import { ChevronDown, Plus, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelPicker } from "@/components/ModelPicker";
import { ModelGlyph } from "@/components/ModelGlyph";
import type { ModelSlot } from "@/lib/types";
import { MODELS } from "@/lib/modelCatalog";
import { cn } from "@/lib/utils";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
  const { currentPlanId, openUpgradeModal } = useBillingStore();
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);
  const statusLabel =
    activeSlot?.status === "streaming"
      ? t("modelPicker.streaming")
      : activeSlot?.status === "error"
        ? t("modelPicker.error")
        : t("modelPicker.done");

  return (
    <div className="flex items-center justify-between gap-4 border-b bg-card/70 px-4 py-3 backdrop-blur">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t("navigation.currentChat")}
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
              {statusLabel}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("navigation.new")}
        </Button>
        <ModelPicker
          value={activeSlot?.modelId ?? "openai/gpt-5.2"}
          onChange={onSelectModel}
          lockedModelIds={lockedModelIds}
          onSelectLocked={(modelId) =>
            openUpgradeModal({
              reason: t("billing.unlockMoreModels"),
              lockedModelId: modelId,
            })
          }
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm transition-all duration-150 hover:bg-muted/40"
            >
              <ModelGlyph modelId={activeSlot?.modelId} size="sm" />
              <span className="max-w-[160px] truncate font-semibold">
                {activeSlot?.label ?? t("topBar.selectModel")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title={t("accessibility.openSettings")}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
