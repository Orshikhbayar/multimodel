"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelPicker } from "@/components/ModelPicker";
import { useChatStore, MODE_OPTIONS } from "@/lib/store";
import { getModelById, getProviderById, MODELS } from "@/lib/modelCatalog";
import { useI18n } from "@/lib/i18n";
import type { InteractionMode, ModelSlot } from "@/lib/types";
import { useBillingStore } from "@/lib/billing/store";
import { getNextPlanForSlots, getPlanById } from "@/lib/billing/plans";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AITeamDrawer({ open, onOpenChange }: DrawerProps) {
  const { t } = useI18n();
  const {
    slots,
    activeSlotId,
    mode,
    instructions,
    setSlotModel,
    toggleSlot,
    setMode,
    setInstructions,
    resetSettings,
  } = useChatStore();
  const { currentPlanId, openUpgradeModal } = useBillingStore();
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);

  const [draftSlots, setDraftSlots] = useState<ModelSlot[]>(slots);
  const [draftMode, setDraftMode] = useState<InteractionMode>(mode);
  const [draftInstructions, setDraftInstructions] = useState(instructions);
  const enabledModelCount = useMemo(
    () => draftSlots.filter((slot) => slot.enabled).length,
    [draftSlots],
  );

  const updateDraftSlot = (slotId: string, updates: Partial<ModelSlot>) => {
    setDraftSlots((prev) =>
      prev.map((slot) =>
        slot.slotId === slotId ? { ...slot, ...updates } : slot,
      ),
    );
  };

  const toggleDraftSlot = (slotId: string, checked: boolean) => {
    setDraftSlots((prev) => {
      const enabledCount = prev.filter((slot) => slot.enabled).length;
      if (checked && enabledCount >= plan.maxEnabledModels) {
        const recommended = getNextPlanForSlots(enabledCount + 1);
        openUpgradeModal({
          reason: t("billing.unlockMoreModels"),
          requiredPlanId: recommended?.id,
        });
        return prev;
      }
      return prev.map((slot) => {
        if (slot.slotId !== slotId) return slot;
        if (!checked && enabledCount <= 1) return slot;
        return { ...slot, enabled: checked };
      });
    });
  };

  const handleSave = () => {
    draftSlots.forEach((slot) => {
      const current = slots.find((existing) => existing.slotId === slot.slotId);
      if (!current) return;
      if (current.modelId !== slot.modelId) {
        setSlotModel(slot.slotId, slot.modelId);
      }
      if (current.enabled !== slot.enabled) {
        toggleSlot(slot.slotId);
      }
    });
    if (draftMode !== mode) setMode(draftMode);
    if (draftInstructions !== instructions) setInstructions(draftInstructions);
    onOpenChange(false);
  };

  const handleReset = () => {
    resetSettings();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraftSlots(slots);
          setDraftMode(mode);
          setDraftInstructions(instructions);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="sm:max-w-xl">
        <SheetHeader className="items-start">
          <SheetTitle>{t("settings.aiTeamSettings")}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {t("settings.chooseModelsAndCollab")}
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t("settings.models")}</h4>
            <div className="grid grid-cols-1 gap-2">
              {draftSlots.map((slot) => {
                const providerName =
                  getProviderById(slot.providerId)?.name ?? slot.providerId;
                const isActive = slot.slotId === activeSlotId;

                return (
                  <div
                    key={slot.slotId}
                    className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <Checkbox
                        checked={slot.enabled}
                        onCheckedChange={(checked) =>
                          toggleDraftSlot(slot.slotId, Boolean(checked))
                        }
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{slot.label}</p>
                          {isActive ? (
                            <Badge variant="secondary">{t("common.active")}</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {providerName}
                        </p>
                      </div>
                    </label>

                    <ModelPicker
                      value={slot.modelId}
                      onChange={(modelId) => {
                        const model = getModelById(modelId);
                        updateDraftSlot(slot.slotId, {
                          modelId: model?.id ?? modelId,
                          providerId: model?.providerId ?? slot.providerId,
                          label: model?.label ?? slot.label,
                        });
                      }}
                      lockedModelIds={lockedModelIds}
                      onSelectLocked={(modelId) =>
                        openUpgradeModal({
                          reason: t("billing.unlockMoreModels"),
                          lockedModelId: modelId,
                        })
                      }
                      trigger={
                        <Button variant="outline" size="sm">
                          {t("settings.change")}
                        </Button>
                      }
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.minOneModel")}
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t("settings.mode")}</h4>
            <RadioGroup
              value={draftMode}
              onValueChange={(val) => setDraftMode(val as InteractionMode)}
              className="grid grid-cols-1 gap-2 md:grid-cols-2"
            >
              {MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 hover:border-primary"
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <div>
                    <Label htmlFor={option.value} className="cursor-pointer">
                      {option.value === "smart"
                        ? t("settings.modeAuto")
                        : option.value === "conversation"
                          ? t("settings.modeParallelAnswers")
                          : option.value === "ensemble"
                            ? t("settings.modeCombinedAnswer")
                            : option.value === "expert"
                              ? t("settings.modeExpertReview")
                              : option.value === "debate"
                                ? t("settings.modeProsAndCons")
                                : option.value === "simulation"
                                  ? t("settings.modeRolePlay")
                                  : t("settings.modeWebBacked")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {option.value === "smart"
                        ? t("settings.modeAutoDescription")
                        : option.value === "conversation"
                          ? t("settings.modeParallelDescription")
                          : option.value === "ensemble"
                            ? t("settings.modeCombinedDescription")
                            : option.value === "expert"
                              ? t("settings.modeExpertDescription")
                              : option.value === "debate"
                                ? t("settings.modeDebateDescription")
                                : option.value === "simulation"
                                  ? t("settings.modeRoleDescription")
                                  : t("settings.modeWebDescription")}
                    </p>
                  </div>
                </label>
              ))}
            </RadioGroup>
            {(draftMode === "ensemble" || draftMode === "debate") &&
            enabledModelCount === 1 ? (
              <p className="text-xs text-muted-foreground">
                {t("chat.needsTwoModelsForUnified")}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t("settings.sharedInstructions")}</h4>
            <Textarea
              value={draftInstructions}
              onChange={(event) => setDraftInstructions(event.target.value)}
              placeholder={t("settings.sharedInstructionsPlaceholder")}
              className="min-h-[140px] border-border/95 bg-background ring-1 ring-border/85 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.28)] focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-0"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={handleReset}>
              {t("settings.reset")}
            </Button>
            <Button onClick={handleSave}>{t("settings.save")}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
