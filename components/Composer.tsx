"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Square, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { ModelGlyph } from "@/components/ModelGlyph";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useStreamStore } from "@/lib/stores";
import { estimateChatCostForSlots } from "@/lib/billing/estimator";
import { formatCredits } from "@/lib/billing/utils";
import type { Currency } from "@/lib/billing/types";
import { useSettingsStore, type WorkflowPreset } from "@/lib/stores";
import { useI18n } from "@/lib/i18n";

interface ComposerProps {
  onSend?: (value: string) => void;
  onOpenTools?: () => void;
  modelId: string;
  modelLabel: string;
  enabledModelIds: string[];
  currency: Currency;
  lockedModelIds: string[];
  onSelectModel: (modelId: string) => void;
  onSelectLocked: (modelId: string) => void;
}

export function Composer({
  onSend,
  onOpenTools,
  modelId,
  modelLabel,
  enabledModelIds,
  currency,
  lockedModelIds,
  onSelectModel,
  onSelectLocked,
}: ComposerProps) {
  const { sendMessage, stopAllStreams } = useChatActions();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxHeight = 160;
  const activeStreamCount = useStreamStore(
    (state) => state.activeStreams.size,
  );
  const { t, locale } = useI18n();
  const workflowPreset = useSettingsStore((state) => state.workflowPreset);
  const isStreaming = activeStreamCount > 0;
  const trimmedValue = value.trim();
  const workflowPresetLabel = useMemo(() => {
    const labels: Record<WorkflowPreset, string> = {
      general: t("settings.presetGeneral"),
      engineer: t("settings.presetEngineer"),
      marketing: t("settings.presetMarketing"),
    };
    return labels[workflowPreset];
  }, [t, workflowPreset]);
  const quickStartPrompts = useMemo(
    () => [
      {
        label: t("composer.quickDebugLabel"),
        prompt: t("composer.quickDebugPrompt"),
      },
      {
        label: t("composer.quickRefactorLabel"),
        prompt: t("composer.quickRefactorPrompt"),
      },
      {
        label: t("composer.quickLandingLabel"),
        prompt: t("composer.quickLandingPrompt"),
      },
      {
        label: t("composer.quickCampaignLabel"),
        prompt: t("composer.quickCampaignPrompt"),
      },
      {
        label: t("composer.quickAbLabel"),
        prompt: t("composer.quickAbPrompt"),
      },
    ],
    [t],
  );
  const filteredQuickStartPrompts = useMemo(() => {
    if (workflowPreset === "engineer") {
      return quickStartPrompts.slice(0, 2);
    }
    if (workflowPreset === "marketing") {
      return quickStartPrompts.slice(2);
    }
    return quickStartPrompts;
  }, [quickStartPrompts, workflowPreset]);
  const modelIdsForEstimate = useMemo(
    () => (enabledModelIds.length > 0 ? enabledModelIds : [modelId]),
    [enabledModelIds, modelId],
  );
  const estimatedCost = useMemo(() => {
    if (!trimmedValue) return 0;
    return estimateChatCostForSlots({
      modelIds: modelIdsForEstimate,
      input: trimmedValue,
      currency,
    });
  }, [currency, modelIdsForEstimate, trimmedValue]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value]);

  const handleSend = () => {
    if (!trimmedValue) return;
    (onSend ?? sendMessage)(value);
    setValue("");
  };

  return (
    <div className="rounded-[1.2rem] border border-border/75 bg-[hsl(var(--app-panel-2)/0.88)] px-3.5 py-3 shadow-[0_18px_42px_-30px_hsl(var(--foreground)/0.55)] backdrop-blur-xl">
      <div className="flex flex-col gap-2.5">
        {value.length === 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {t("composer.quickStart")} {workflowPresetLabel}
            </span>
            {filteredQuickStartPrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                onClick={() => {
                  setValue(item.prompt);
                  textareaRef.current?.focus();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("composer.placeholder")}
          className="min-h-[46px] max-h-[160px] w-full resize-none border-0 bg-transparent px-0 text-sm leading-relaxed shadow-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex items-center gap-2 self-end">
          {onOpenTools ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenTools}
              className="h-9 rounded-xl px-3"
            >
              <Wrench className="mr-1 h-3.5 w-3.5" />
              Tools
            </Button>
          ) : null}
          <ModelPicker
            value={modelId}
            onChange={onSelectModel}
            lockedModelIds={lockedModelIds}
            onSelectLocked={onSelectLocked}
            popoverSide="top"
            popoverAlign="end"
            trigger={
              <button
                type="button"
                className="relative flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1.5 text-xs font-medium shadow-sm transition-all duration-150 hover:bg-muted/40"
              >
                <ModelGlyph modelId={modelId} size="sm" />
                <span className="max-w-[120px] truncate">{modelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            }
          />
          <Button
            onClick={isStreaming ? stopAllStreams : handleSend}
            size="icon"
            className="h-9 w-9 rounded-xl"
            variant={isStreaming ? "secondary" : "default"}
          >
            {isStreaming ? (
              <Square className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
            <span className="sr-only">
              {isStreaming
                ? t("composer.stopGenerating")
                : t("composer.send")}
            </span>
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span>{t("composer.shortcutsHint")}</span>
        <span>
          {trimmedValue
            ? `${t("composer.estimatedCost")} ${formatCredits(estimatedCost, currency, locale)} (${modelIdsForEstimate.length} ${modelIdsForEstimate.length === 1 ? t("composer.modelSingular") : t("composer.modelPlural")})`
            : t("composer.estimateAppears")}
        </span>
      </div>
    </div>
  );
}
