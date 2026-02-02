"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";

import { ChatThread } from "@/components/ChatThread";
import { VirtualizedChatThread } from "@/components/VirtualizedChatThread";
import { Composer } from "@/components/Composer";
import { DisagreementsDialog } from "@/components/DisagreementsDialog";
import { SourcesDialog } from "@/components/SourcesDialog";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { TopUpModal } from "@/components/billing/TopUpModal";
import { OutOfCreditsModal } from "@/components/billing/OutOfCreditsModal";
import { Button } from "@/components/ui/button";
import { ChatContentContainer } from "@/components/ChatContentContainer";
import { MODELS } from "@/lib/modelCatalog";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useConversationStore, useModelStore } from "@/lib/stores";
import type { Run } from "@/lib/types";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { estimateChatCostForSlots } from "@/lib/billing/estimator";

export function ChatWorkspace() {
  const {
    conversations,
    currentConversationId,
    projects,
  } = useConversationStore();
  const { slots, activeSlotId, setSlotModel } = useModelStore();
  const { sendMessage } = useChatActions();
  const [activeTab, setActiveTab] = useState(activeSlotId ?? "slot-1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesRun, setSourcesRun] = useState<Run | null>(null);
  const [disagreementsRun, setDisagreementsRun] = useState<Run | null>(null);
  const {
    currency,
    currentPlanId,
    resetPeriodIfNeeded,
    spendCredits,
    openUpgradeModal,
  } = useBillingStore();

  const conversation = useMemo(() => {
    return (
      conversations.find((conv) => conv.id === currentConversationId) ??
      conversations[0]
    );
  }, [conversations, currentConversationId]);
  const isEmpty = !conversation?.messages?.length;

  useEffect(() => {
    if (activeSlotId && activeTab !== activeSlotId) {
      setActiveTab(activeSlotId);
    }
  }, [activeSlotId, activeTab]);

  useEffect(() => {
    resetPeriodIfNeeded();
  }, [resetPeriodIfNeeded]);

  const project = projects.find((p) => p.id === conversation?.projectId);
  const activeSlot = slots.find((slot) => slot.slotId === activeSlotId) ?? slots[0];
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);

  const handleSend = (value: string) => {
    if (!value.trim()) return;
    resetPeriodIfNeeded();
    const enabledModelIds = slots.filter((slot) => slot.enabled).map((slot) => slot.modelId);
    const estimatedCost = estimateChatCostForSlots({
      modelIds: enabledModelIds,
      input: value,
      currency,
    });
    const ok = spendCredits(estimatedCost, `Chat message (${enabledModelIds.length} model(s))`);
    if (!ok) return;
    sendMessage(value);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex flex-1 flex-col gap-3 px-4 py-4 min-h-0">
        {/* Removed mode + instructions strip for a cleaner chat area */}

        {/* Tabs removed; active model is controlled via chat controls */}

        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center">
            <ChatContentContainer className="space-y-4">
              <ChatControls onOpenSettings={() => setSettingsOpen(true)} />
              <Composer
                onSend={handleSend}
                modelId={activeSlot?.modelId ?? "openai/gpt-4.1"}
                modelLabel={activeSlot?.label ?? "Select model"}
                lockedModelIds={lockedModelIds}
                onSelectModel={(modelId) => activeSlot && setSlotModel(activeSlot.slotId, modelId)}
                onSelectLocked={(modelId) =>
                  openUpgradeModal({
                    reason: "This model is available on higher tiers.",
                    lockedModelId: modelId,
                  })
                }
              />
            </ChatContentContainer>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3 min-h-0">
            <ChatThread
              conversation={conversation}
              activeTab={activeTab}
              slots={slots}
              onShowSources={(run) => setSourcesRun(run)}
              onShowDisagreements={(run) => setDisagreementsRun(run)}
            />
            <ChatContentContainer className="sticky bottom-4 z-10 space-y-2">
              <ChatControls onOpenSettings={() => setSettingsOpen(true)} />
              <Composer
                onSend={handleSend}
                modelId={activeSlot?.modelId ?? "openai/gpt-4.1"}
                modelLabel={activeSlot?.label ?? "Select model"}
                lockedModelIds={lockedModelIds}
                onSelectModel={(modelId) =>
                  activeSlot && setSlotModel(activeSlot.slotId, modelId)
                }
                onSelectLocked={(modelId) =>
                  openUpgradeModal({
                    reason: "This model is available on higher tiers.",
                    lockedModelId: modelId,
                  })
                }
              />
            </ChatContentContainer>
          </div>
        )}
      </div>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SourcesDialog
        open={Boolean(sourcesRun)}
        onOpenChange={(open) => !open && setSourcesRun(null)}
        sources={sourcesRun?.sources ?? []}
      />
      <DisagreementsDialog
        open={Boolean(disagreementsRun)}
        onOpenChange={(open) => !open && setDisagreementsRun(null)}
        disagreements={disagreementsRun?.disagreements ?? []}
      />
      <UpgradeModal />
      <TopUpModal />
      <OutOfCreditsModal />
    </div>
  );
}


function ChatControls({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <Button variant="ghost" size="icon" onClick={onOpenSettings} title="Settings">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
