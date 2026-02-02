"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelPicker } from "@/components/ModelPicker";
import { useChatStore, MODE_OPTIONS } from "@/lib/store";
import { getModelById, getProviderById, MODELS } from "@/lib/modelCatalog";
import type { InteractionMode, ModelSlot } from "@/lib/types";
import { useBillingStore } from "@/lib/billing/store";
import { getNextPlanForSlots, getPlanById } from "@/lib/billing/plans";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AITeamDrawer({ open, onOpenChange }: DrawerProps) {
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

  const updateDraftSlot = (slotId: string, updates: Partial<ModelSlot>) => {
    setDraftSlots((prev) =>
      prev.map((slot) => (slot.slotId === slotId ? { ...slot, ...updates } : slot)),
    );
  };

  const toggleDraftSlot = (slotId: string, checked: boolean) => {
    setDraftSlots((prev) => {
      const enabledCount = prev.filter((slot) => slot.enabled).length;
      if (checked && enabledCount >= plan.maxEnabledModels) {
        const recommended = getNextPlanForSlots(enabledCount + 1);
        openUpgradeModal({
          reason: "Your plan limits how many models can run in parallel.",
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
          <SheetTitle>AI Team Settings</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Choose which models participate and how they collaborate.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Models</h4>
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
                            <Badge variant="secondary">Active</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{providerName}</p>
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
                          reason: "This model is available on higher tiers.",
                          lockedModelId: modelId,
                        })
                      }
                      trigger={
                        <Button variant="outline" size="sm">
                          Change
                        </Button>
                      }
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum one model required. Add more to unlock ensemble and debate.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Mode</h4>
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
                      {option.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Shared instructions</h4>
            <Textarea
              value={draftInstructions}
              onChange={(event) => setDraftInstructions(event.target.value)}
              placeholder="Describe policies, tone, constraints, or routing hints."
              className="min-h-[140px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={handleReset}>
              Reset
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
