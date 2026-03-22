"use client";

import { useMemo } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { useI18n } from "@/lib/i18n";
import { MODELS, getProviderById, getModelById } from "@/lib/modelCatalog";
import { MODE_OPTIONS, useChatStore } from "@/lib/store";
import { useBillingStore } from "@/lib/billing/store";
import { getNextPlanForSlots, getPlanById } from "@/lib/billing/plans";

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const { t } = useI18n();
  const {
    slots,
    activeSlotId,
    mode,
    instructions,
    setActiveSlot,
    setSlotModel,
    toggleSlot,
    setMode,
    setInstructions,
  } = useChatStore();
  const { currentPlanId, openUpgradeModal } = useBillingStore();
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.slotId.localeCompare(b.slotId)),
    [slots],
  );
  const enabledModelCount = useMemo(
    () => slots.filter((slot) => slot.enabled).length,
    [slots],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl p-0 h-full">
        <div className="flex h-full flex-col">
          <div className="border-b px-5 pb-3 pt-4">
            <SheetHeader className="items-start">
              <SheetTitle>{t("settings.workspaceSettings")}</SheetTitle>
            </SheetHeader>
          </div>

          <ScrollArea className="flex-1 px-5 py-4">
            <div className="space-y-6">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">
                    {t("settings.aiTeam")}
                  </h4>
                </div>
                <div className="space-y-2">
                  {sortedSlots.map((slot) => {
                    const provider =
                      getProviderById(slot.providerId)?.name ?? slot.providerId;
                    const isActive = slot.slotId === activeSlotId;

                    return (
                      <div
                        key={slot.slotId}
                        className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-2">
                          <Switch
                            checked={slot.enabled}
                            onCheckedChange={() => {
                              const enabledCount = slots.filter(
                                (s) => s.enabled,
                              ).length;
                              const willEnable = !slot.enabled;
                              if (
                                willEnable &&
                                enabledCount >= plan.maxEnabledModels
                              ) {
                                const recommended = getNextPlanForSlots(
                                  enabledCount + 1,
                                );
                                openUpgradeModal({
                                  reason: t("billing.unlockMoreModels"),
                                  requiredPlanId: recommended?.id,
                                });
                                return;
                              }
                              toggleSlot(slot.slotId);
                            }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">
                                {slot.label}
                              </p>
                              {isActive ? (
                                <Badge variant="secondary">
                                  {t("common.active")}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("settings.poweredBy", { provider })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActiveSlot(slot.slotId)}
                          >
                            {t("settings.setActive")}
                          </Button>
                          <ModelPicker
                            value={slot.modelId}
                            onChange={(modelId) => {
                              const model = getModelById(modelId);
                              setSlotModel(slot.slotId, model?.id ?? modelId);
                            }}
                            lockedModelIds={lockedModelIds}
                            onSelectLocked={(modelId) =>
                              openUpgradeModal({
                                reason: t("billing.unlockMoreModels"),
                                lockedModelId: modelId,
                              })
                            }
                            trigger={
                              <Button size="sm" variant="outline">
                                {t("settings.change")}
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.turnOnMultipleModels")}
                </p>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">
                    {t("settings.behavior")}
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.chooseHowTeamCollaborates")}
                </p>
                <RadioGroup
                  value={mode}
                  onValueChange={(value) => setMode(value as typeof mode)}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  {MODE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 hover:border-primary"
                    >
                      <RadioGroupItem value={option.value} id={option.value} />
                      <div>
                        <Label
                          htmlFor={option.value}
                          className="cursor-pointer"
                        >
                          {option.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {option.description}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {option.bestFor}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {option.outputStyle}
                        </p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
                <div className="space-y-2">
                  <Label htmlFor="settings-shared-instructions">
                    {t("settings.sharedInstructions")}
                  </Label>
                  <Textarea
                    id="settings-shared-instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder={t("settings.sharedInstructionsPlaceholder")}
                    className="min-h-[120px] border-border/95 bg-background ring-1 ring-border/85 shadow-[inset_0_0_0_1px_hsl(var(--border)/0.28)] focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.sharedInstructionsApplied")}
                  </p>
                </div>
              </section>
            </div>
          </ScrollArea>

          <div className="border-t px-5 py-3" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
