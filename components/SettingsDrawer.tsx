"use client";

import { useMemo } from "react";
import { SlidersHorizontal, Sparkles, UserRound, Megaphone } from "lucide-react";

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
import {
  MODELS,
  getProviderById,
  getModelById,
} from "@/lib/modelCatalog";
import { MODE_OPTIONS, WORKFLOW_PRESETS, useChatStore } from "@/lib/store";
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
    workflowPreset,
    setActiveSlot,
    setSlotModel,
    toggleSlot,
    setMode,
    setInstructions,
    applyWorkflowPreset,
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
                  <h4 className="text-sm font-semibold">{t("settings.aiTeam")}</h4>
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
                                <Badge variant="secondary">{t("common.active")}</Badge>
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
                  <h4 className="text-sm font-semibold">{t("settings.workflowPreset")}</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("settings.presetsTuneDefaults")}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {WORKFLOW_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => applyWorkflowPreset(preset.value)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        workflowPreset === preset.value
                          ? "border-primary bg-primary/10"
                          : "bg-muted/30 hover:border-primary"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 font-semibold">
                        {preset.value === "engineer" ? (
                          <UserRound className="h-3.5 w-3.5" />
                        ) : preset.value === "marketing" ? (
                          <Megaphone className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {preset.value === "general"
                            ? t("settings.presetGeneral")
                            : preset.value === "engineer"
                              ? t("settings.presetEngineer")
                              : t("settings.presetMarketing")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {preset.value === "general"
                          ? t("settings.presetGeneralDescription")
                          : preset.value === "engineer"
                            ? t("settings.presetEngineerDescription")
                            : t("settings.presetMarketingDescription")}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{t("settings.behavior")}</h4>
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
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {option.value === "smart"
                            ? t("settings.bestFor", {
                                text: t("settings.modeAutoBestFor"),
                              })
                            : option.value === "conversation"
                              ? t("settings.bestFor", {
                                  text: t("settings.modeParallelBestFor"),
                                })
                              : option.value === "ensemble"
                                ? t("settings.bestFor", {
                                    text: t("settings.modeCombinedBestFor"),
                                  })
                                : option.value === "expert"
                                  ? t("settings.bestFor", {
                                      text: t("settings.modeExpertBestFor"),
                                    })
                                  : option.value === "debate"
                                    ? t("settings.bestFor", {
                                        text: t("settings.modeDebateBestFor"),
                                      })
                                    : option.value === "simulation"
                                      ? t("settings.bestFor", {
                                          text: t("settings.modeRoleBestFor"),
                                        })
                                      : t("settings.bestFor", {
                                          text: t("settings.modeWebBestFor"),
                                        })}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {option.value === "smart"
                            ? t("settings.output", {
                                text: t("settings.modeAutoOutput"),
                              })
                            : option.value === "conversation"
                              ? t("settings.output", {
                                  text: t("settings.modeParallelOutput"),
                                })
                              : option.value === "ensemble"
                                ? t("settings.output", {
                                    text: t("settings.modeCombinedOutput"),
                                  })
                                : option.value === "expert"
                                  ? t("settings.output", {
                                      text: t("settings.modeExpertOutput"),
                                    })
                                  : option.value === "debate"
                                    ? t("settings.output", {
                                        text: t("settings.modeDebateOutput"),
                                      })
                                    : option.value === "simulation"
                                      ? t("settings.output", {
                                          text: t("settings.modeRoleOutput"),
                                        })
                                      : t("settings.output", {
                                          text: t("settings.modeWebOutput"),
                                        })}
                        </p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
                {(mode === "ensemble" || mode === "debate") &&
                enabledModelCount === 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("chat.needsTwoModelsForUnified")}
                  </p>
                ) : null}
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
