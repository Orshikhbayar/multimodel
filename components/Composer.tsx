"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useStreamStore } from "@/lib/stores";
import { estimateChatCostForSlots } from "@/lib/billing/estimator";
import { formatCredits } from "@/lib/billing/utils";
import type { Currency } from "@/lib/billing/types";
import { useAppSettingsStore } from "@/lib/state/settingsStore";
import { getComposerCopy } from "@/lib/i18n/composerCopy";

interface ComposerProps {
  onSend?: (value: string) => void;
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
  const locale = useAppSettingsStore((state) => state.locale);
  const isStreaming = activeStreamCount > 0;
  const trimmedValue = value.trim();
  const composerCopy = useMemo(() => getComposerCopy(locale), [locale]);
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
    <div className="rounded-2xl border border-white/10 bg-[hsl(var(--app-panel-2))] px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-2">
        {value.length === 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {composerCopy.quickStartLabel}
            </span>
            {composerCopy.quickStartPrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                className="ui-hover-lift-sm rounded-full border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
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
          placeholder={composerCopy.placeholder}
          className="min-h-[44px] max-h-[160px] w-full resize-none border-0 bg-transparent text-sm shadow-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex items-center gap-2 self-end">
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
                className="ui-hover-lift-sm relative flex items-center gap-2 rounded-full border bg-[hsl(var(--app-panel))] px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted/40"
              >
                <span className="max-w-[120px] truncate">{modelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            }
          />
          <Button
            onClick={isStreaming ? stopAllStreams : handleSend}
            size="icon"
            className="rounded-xl"
            variant={isStreaming ? "secondary" : "default"}
          >
            {isStreaming ? (
              <Square className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
            <span className="sr-only">
              {isStreaming ? composerCopy.stopGenerating : composerCopy.send}
            </span>
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pb-1 text-[11px] text-muted-foreground">
        <span>{composerCopy.shortcutsHint}</span>
        <span>
          {trimmedValue
            ? `${composerCopy.estimatedCostLabel} ${formatCredits(estimatedCost, currency)} (${modelIdsForEstimate.length} ${modelIdsForEstimate.length === 1 ? composerCopy.modelSingular : composerCopy.modelPlural})`
            : composerCopy.estimateAppearsHint}
        </span>
      </div>
    </div>
  );
}
