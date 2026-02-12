"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings, Sparkles } from "lucide-react";

import { ChatThread } from "@/components/ChatThread";
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
import { useI18n } from "@/lib/i18n";
import {
  MODE_OPTIONS,
  useConversationStore,
  useModelStore,
  useSettingsStore,
} from "@/lib/stores";
import type { Run } from "@/lib/types";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";

export function ChatWorkspace() {
  const { t } = useI18n();
  const { conversations, currentConversationId } = useConversationStore();
  const { slots, activeSlotId, setSlotModel } = useModelStore();
  const { sendMessage } = useChatActions();
  const { mode } = useSettingsStore();
  const activeTab = activeSlotId ?? slots[0]?.slotId ?? "slot-1";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesRun, setSourcesRun] = useState<Run | null>(null);
  const [disagreementsRun, setDisagreementsRun] = useState<Run | null>(null);
  const {
    currency,
    currentPlanId,
    resetPeriodIfNeeded,
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
    resetPeriodIfNeeded();
  }, [resetPeriodIfNeeded]);

  const activeSlot =
    slots.find((slot) => slot.slotId === activeSlotId) ?? slots[0];
  const enabledModelIds = useMemo(
    () => slots.filter((slot) => slot.enabled).map((slot) => slot.modelId),
    [slots],
  );
  const plan = getPlanById(currentPlanId);
  const lockedModelIds = MODELS.filter(
    (model) => !plan.allowedModelIds.includes(model.id),
  ).map((model) => model.id);
  const modeOption = MODE_OPTIONS.find((option) => option.value === mode);
  const modeLabel =
    modeOption?.value === "smart"
      ? t("settings.modeAuto")
      : modeOption?.value === "conversation"
        ? t("settings.modeParallelAnswers")
        : modeOption?.value === "ensemble"
          ? t("settings.modeCombinedAnswer")
          : modeOption?.value === "expert"
            ? t("settings.modeExpertReview")
            : modeOption?.value === "debate"
              ? t("settings.modeProsAndCons")
              : modeOption?.value === "simulation"
                ? t("settings.modeRolePlay")
                : t("settings.modeWebBacked");
  const modeOutputStyle =
    modeOption?.value === "smart"
      ? t("settings.modeAutoOutput")
      : modeOption?.value === "conversation"
        ? t("settings.modeParallelOutput")
        : modeOption?.value === "ensemble"
          ? t("settings.modeCombinedOutput")
          : modeOption?.value === "expert"
            ? t("settings.modeExpertOutput")
            : modeOption?.value === "debate"
              ? t("settings.modeDebateOutput")
              : modeOption?.value === "simulation"
                ? t("settings.modeRoleOutput")
                : t("settings.modeWebOutput");

  const handleSend = (value: string) => {
    if (!value.trim()) return;
    resetPeriodIfNeeded();
    sendMessage(value);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex flex-1 flex-col gap-3 px-4 py-4 min-h-0">
        {/* Removed mode + instructions strip for a cleaner chat area */}

        {/* Tabs removed; active model is controlled via chat controls */}

        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center">
            <ChatContentContainer
              className="space-y-4"
              maxWidth="var(--chat-max-width)"
            >
              <ChatControls
                modeLabel={modeLabel}
                modeOutputStyle={modeOutputStyle}
                enabledModelCount={enabledModelIds.length}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              <Composer
                onSend={handleSend}
                modelId={activeSlot?.modelId ?? "openai/gpt-5.2"}
                modelLabel={activeSlot?.label ?? t("topBar.selectModel")}
                enabledModelIds={enabledModelIds}
                currency={currency}
                lockedModelIds={lockedModelIds}
                onSelectModel={(modelId) =>
                  activeSlot && setSlotModel(activeSlot.slotId, modelId)
                }
                onSelectLocked={(modelId) =>
                  openUpgradeModal({
                    reason: t("billing.unlockMoreModels"),
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
            <ChatContentContainer
              className="sticky bottom-4 z-10 space-y-2"
              maxWidth="var(--chat-max-width)"
            >
              <ChatControls
                modeLabel={modeLabel}
                modeOutputStyle={modeOutputStyle}
                enabledModelCount={enabledModelIds.length}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              <Composer
                onSend={handleSend}
                modelId={activeSlot?.modelId ?? "openai/gpt-5.2"}
                modelLabel={activeSlot?.label ?? t("topBar.selectModel")}
                enabledModelIds={enabledModelIds}
                currency={currency}
                lockedModelIds={lockedModelIds}
                onSelectModel={(modelId) =>
                  activeSlot && setSlotModel(activeSlot.slotId, modelId)
                }
                onSelectLocked={(modelId) =>
                  openUpgradeModal({
                    reason: t("billing.unlockMoreModels"),
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

function ChatControls({
  modeLabel,
  modeOutputStyle,
  enabledModelCount,
  onOpenSettings,
}: {
  modeLabel: string;
  modeOutputStyle: string;
  enabledModelCount: number;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          <span className="font-medium text-foreground">{modeLabel}</span>
          {` · ${enabledModelCount} ${
            enabledModelCount === 1
              ? t("composer.modelSingular")
              : t("composer.modelPlural")
          } · ${modeOutputStyle}`}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        title={t("accessibility.openSettings")}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
