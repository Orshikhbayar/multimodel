"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings, Sparkles } from "lucide-react";

import { ChatThread } from "@/components/ChatThread";
import { Composer } from "@/components/Composer";
import { DisagreementsDialog } from "@/components/DisagreementsDialog";
import { SourcesDialog } from "@/components/SourcesDialog";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { ToolDrawer } from "@/components/tools/ToolDrawer";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { TopUpModal } from "@/components/billing/TopUpModal";
import { OutOfCreditsModal } from "@/components/billing/OutOfCreditsModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface ChatWorkspaceProps {
  projectId?: string | null;
  conversationId?: string;
  projectName?: string;
  projectArchived?: boolean;
}

export function ChatWorkspace({
  projectId,
  conversationId,
  projectName,
  projectArchived = false,
}: ChatWorkspaceProps) {
  const { t } = useI18n();
  const { conversations, currentConversationId, setCurrentConversation } =
    useConversationStore();
  const { slots, activeSlotId, setSlotModel } = useModelStore();
  const { sendMessage } = useChatActions();
  const { mode } = useSettingsStore();
  const activeTab = activeSlotId ?? slots[0]?.slotId ?? "slot-1";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sourcesRun, setSourcesRun] = useState<Run | null>(null);
  const [disagreementsRun, setDisagreementsRun] = useState<Run | null>(null);
  const { currency, currentPlanId, openUpgradeModal } = useBillingStore();
  const isProjectScope = typeof projectId === "string" && projectId.length > 0;

  const scopedConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        isProjectScope
          ? conversation.projectId === projectId
          : !conversation.projectId,
      ),
    [conversations, isProjectScope, projectId],
  );
  const conversation = useMemo(() => {
    if (conversationId) {
      return scopedConversations.find((conv) => conv.id === conversationId);
    }

    const current = currentConversationId
      ? scopedConversations.find((conv) => conv.id === currentConversationId)
      : undefined;
    return current ?? scopedConversations[0];
  }, [conversationId, currentConversationId, scopedConversations]);
  const isEmpty = !conversation?.messages?.length;
  const hasNoChats = scopedConversations.length === 0;

  useEffect(() => {
    const nextId = conversation?.id ?? null;
    if (nextId !== currentConversationId) {
      setCurrentConversation(nextId);
    }
  }, [conversation?.id, currentConversationId, setCurrentConversation]);

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
  const contextBadgeLabel = isProjectScope
    ? (projectName ?? t("projects.title"))
    : t("navigation.general");
  const contextBreadcrumb = isProjectScope
    ? `${t("navigation.projects")} / ${projectName ?? t("projects.title")} / ${t("navigation.chat")}`
    : `${t("navigation.chat")} / ${t("navigation.general")}`;
  const emptyScopeMessage = projectArchived
    ? t("projects.archivedReadOnly", {
        project: projectName ?? t("projects.title"),
      })
    : isProjectScope
      ? t("projects.noChatsInProject")
      : null;

  const handleSend = (value: string) => {
    if (!value.trim()) return;
    if (projectArchived) return;
    sendMessage(value, projectId ?? undefined);
  };
  const latestMessageId =
    conversation?.messages?.[conversation.messages.length - 1]?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="surface-enter flex min-h-0 flex-1 flex-col gap-4 px-3 pb-4 pt-3 md:px-6 md:pt-5">
        <ChatContentContainer maxWidth="var(--chat-max-width)">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-[hsl(var(--app-panel)/0.72)] px-3 py-2.5 backdrop-blur-sm">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-muted-foreground">
                {contextBreadcrumb}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {contextBadgeLabel}
            </Badge>
          </div>
        </ChatContentContainer>

        {/* Removed mode + instructions strip for a cleaner chat area */}

        {/* Tabs removed; active model is controlled via chat controls */}

        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center">
            <ChatContentContainer
              className="space-y-4 rounded-[1.25rem] border border-border/70 bg-[hsl(var(--app-panel)/0.72)] p-4 shadow-[0_16px_45px_-32px_hsl(var(--foreground)/0.52)] backdrop-blur-sm sm:p-5"
              maxWidth="var(--chat-max-width)"
            >
              {hasNoChats ? (
                emptyScopeMessage ? (
                  <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {emptyScopeMessage}
                  </div>
                ) : null
              ) : null}
              <ChatControls
                modeLabel={modeLabel}
                modeOutputStyle={modeOutputStyle}
                enabledModelCount={enabledModelIds.length}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              {!projectArchived ? (
                <Composer
                  onSend={handleSend}
                  onOpenTools={() => setToolsOpen(true)}
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
              ) : null}
            </ChatContentContainer>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <ChatThread
              conversation={conversation}
              projectId={projectId ?? undefined}
              activeTab={activeTab}
              slots={slots}
              onShowSources={(run) => setSourcesRun(run)}
              onShowDisagreements={(run) => setDisagreementsRun(run)}
            />
            <ChatContentContainer
              className="sticky bottom-3 z-10 space-y-2 pb-1"
              maxWidth="var(--chat-max-width)"
            >
              <ChatControls
                modeLabel={modeLabel}
                modeOutputStyle={modeOutputStyle}
                enabledModelCount={enabledModelIds.length}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              {!projectArchived ? (
                <Composer
                  onSend={handleSend}
                  onOpenTools={() => setToolsOpen(true)}
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
              ) : null}
            </ChatContentContainer>
          </div>
        )}
      </div>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ToolDrawer
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        projectId={projectId ?? null}
        conversationId={conversation?.id}
        currentMessageId={latestMessageId}
      />
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
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          <span className="font-semibold text-foreground">{modeLabel}</span>
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
        className="h-8 w-8 rounded-lg"
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
