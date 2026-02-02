"use client";

import { useMemo, useState } from "react";
import { Plug, SlidersHorizontal, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ModelPicker } from "@/components/ModelPicker";
import { MODELS, PROVIDERS, getProviderById, getModelById } from "@/lib/modelCatalog";
import { useChatStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useBillingStore } from "@/lib/billing/store";
import { getNextPlanForSlots, getPlanById } from "@/lib/billing/plans";

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const { slots, activeSlotId, setActiveSlot, setSlotModel, toggleSlot } = useChatStore();
  const { currentPlanId, openUpgradeModal } = useBillingStore();
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);

  const [connections, setConnections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PROVIDERS.map((provider) => [provider.id, true])),
  );

  const [tools, setTools] = useState({
    web: true,
    files: false,
    automations: true,
  });

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.slotId.localeCompare(b.slotId)),
    [slots],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl p-0 h-full">
        <div className="flex h-full flex-col">
          <div className="border-b px-5 pb-3 pt-4">
            <SheetHeader className="items-start">
              <SheetTitle>Workspace Settings</SheetTitle>
            </SheetHeader>
          </div>

          <ScrollArea className="flex-1 px-5 py-4">
            <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Connections</h4>
              </div>
              <div className="space-y-2">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">
                        API key status: {connections[provider.id] ? "connected" : "not set"}
                      </p>
                    </div>
                    <Switch
                      checked={connections[provider.id]}
                      onCheckedChange={(checked) =>
                        setConnections((prev) => ({ ...prev, [provider.id]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Models</h4>
              </div>
              <div className="space-y-2">
                {sortedSlots.map((slot) => {
                  const provider = getProviderById(slot.providerId)?.name ?? slot.providerId;
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
                            const enabledCount = slots.filter((s) => s.enabled).length;
                            const willEnable = !slot.enabled;
                            if (willEnable && enabledCount >= plan.maxEnabledModels) {
                              const recommended = getNextPlanForSlots(enabledCount + 1);
                              openUpgradeModal({
                                reason: "Your plan limits how many models can run in parallel.",
                                requiredPlanId: recommended?.id,
                              });
                              return;
                            }
                            toggleSlot(slot.slotId);
                          }}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{slot.label}</p>
                            {isActive ? <Badge variant="secondary">Active</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{provider}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setActiveSlot(slot.slotId)}
                        >
                          Focus
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
                              reason: "This model is available on higher tiers.",
                              lockedModelId: modelId,
                            })
                          }
                          trigger={
                            <Button size="sm" variant="outline">
                              Change
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Enabled slots run in parallel for each prompt.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Tools</h4>
              </div>
              <div className="space-y-2">
                {([
                  { id: "web", label: "Web browsing" },
                  { id: "files", label: "File analysis" },
                  { id: "automations", label: "Automations" },
                ] as const).map((tool) => (
                  <div
                    key={tool.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2",
                      tools[tool.id] ? "bg-muted/30" : "bg-background",
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium">{tool.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {tools[tool.id] ? "Enabled" : "Disabled"}
                      </p>
                    </div>
                    <Switch
                      checked={tools[tool.id]}
                      onCheckedChange={(checked) =>
                        setTools((prev) => ({ ...prev, [tool.id]: checked }))
                      }
                    />
                  </div>
                ))}
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
