"use client";

import { useEffect, useMemo } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelPicker } from "@/components/ModelPicker";
import type { ModelSlot, Run } from "@/lib/types";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { MODELS } from "@/lib/modelCatalog";
import { useI18n } from "@/lib/i18n";

interface ModelTabsProps {
  runs?: Run[];
  slots: ModelSlot[];
  activeTab: string;
  onChange: (value: string) => void;
  onSelectModel: (slotId: string, modelId: string) => void;
  onOpenProviderSettings?: (providerId: string) => void;
}

type TabItem =
  | { key: string; label: string; status: Run["status"]; slot: ModelSlot }
  | { key: string; label: string; status: Run["status"] };

export function ModelTabs({
  runs = [],
  slots,
  activeTab,
  onChange,
  onSelectModel,
  onOpenProviderSettings,
}: ModelTabsProps) {
  const { t } = useI18n();
  const { currentPlanId, openUpgradeModal } = useBillingStore();
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);
  const enabledSlots = useMemo(
    () => slots.filter((slot) => slot.enabled),
    [slots],
  );

  const tabItems = useMemo<TabItem[]>(() => {
    const slotItems: TabItem[] = enabledSlots.map((slot) => {
      const run =
        runs.find((r) => r.slotId === slot.slotId) ??
        runs.find((r) => r.model === slot.label);
      return {
        key: slot.slotId,
        label: slot.label,
        status: run?.status ?? "done",
        slot,
      };
    });

    const slotIds = new Set(enabledSlots.map((slot) => slot.slotId));
    const extraRuns = runs.filter(
      (run) => !run.slotId || !slotIds.has(run.slotId),
    );
    const runItems: TabItem[] = extraRuns.map((run) => ({
      key: run.model,
      label: run.model,
      status: run.status,
    }));

    return [...slotItems, ...runItems];
  }, [enabledSlots, runs]);

  useEffect(() => {
    if (tabItems.length === 0) return;
    if (!tabItems.some((item) => item.key === activeTab)) {
      onChange(tabItems[0].key);
    }
  }, [activeTab, onChange, tabItems]);

  return (
    <Tabs value={activeTab} onValueChange={onChange} className="w-full">
      <TabsList className="flex w-full items-center gap-2 overflow-x-auto rounded-lg border bg-muted/40 p-1">
        {tabItems.map((item) => {
          const status = item.status;
          const isSlot = "slot" in item;

          return (
            <div key={item.key} className="flex items-center gap-1">
              <TabsTrigger
                value={item.key}
                className="flex min-w-[120px] items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{item.label}</span>
                  <Badge
                    variant={
                      status === "error"
                        ? "destructive"
                        : status === "streaming"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {status === "streaming"
                      ? t("modelPicker.streaming")
                      : status === "done"
                        ? t("modelPicker.done")
                        : t("modelPicker.error")}
                  </Badge>
                </div>
                {status === "streaming" && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {status === "error" && (
                  <div className="h-2 w-2 rounded-full bg-destructive" />
                )}
                {status === "done" && (
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </TabsTrigger>

              {isSlot ? (
                <ModelPicker
                  value={item.slot.modelId}
                  onChange={(modelId) =>
                    onSelectModel(item.slot.slotId, modelId)
                  }
                  onOpenProviderSettings={onOpenProviderSettings}
                  lockedModelIds={lockedModelIds}
                  onSelectLocked={(modelId) =>
                    openUpgradeModal({
                      reason: t("billing.unlockMoreModels"),
                      lockedModelId: modelId,
                    })
                  }
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border bg-background"
                      title={t("modelPicker.changeModel")}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  }
                />
              ) : null}
            </div>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
