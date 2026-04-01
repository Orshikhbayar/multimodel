"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Globe,
  ImagePlus,
  Loader2,
  Paperclip,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { ModelGlyph } from "@/components/ModelGlyph";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useStreamStore, useSettingsStore, useModelStore } from "@/lib/stores";
import { estimateChatCostForSlots } from "@/lib/billing/estimator";
import { formatCredits } from "@/lib/billing/utils";
import type { Currency } from "@/lib/billing/types";
import { useI18n } from "@/lib/i18n";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClarifyQuestion {
  question: string;
  options: string[];
}

interface AttachedImage {
  dataUrl: string;
  name: string;
  size: number;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const TEXT_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json"];

// ─── Component ────────────────────────────────────────────────────────────────
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
  const { currentPlanId } = useBillingStore();
  const { mode, webSearchEnabled, setWebSearchEnabled } = useSettingsStore();
  const { slots, activeSlotId } = useModelStore();
  const plan = getPlanById(currentPlanId);
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maxHeight = 160;
  const activeStreamCount = useStreamStore((state) => state.activeStreams.size);
  const { t, locale } = useI18n();
  const isStreaming = activeStreamCount > 0;
  const trimmedValue = value.trim();

  // ── Drag & drop state ──────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const dragCounter = useRef(0);

  // ── Clarify state ──────────────────────────────────────────────────────────
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifySelections, setClarifySelections] = useState<
    Record<number, string>
  >({});

  // ── Quick-start prompts ────────────────────────────────────────────────────
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

  const placeholder = useMemo(() => {
    if (mode === "single") {
      const activeSlot = slots.find((s) => s.slotId === activeSlotId);
      return t("composer.placeholderSingle").replace(
        "{model}",
        activeSlot?.label ?? "AI",
      );
    }
    if (mode === "compare") return t("composer.placeholderCompare");
    return t("composer.placeholderTeam");
  }, [mode, slots, activeSlotId, t]);

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

  // ── Send ──────────────────────────────────────────────────────────────────
  const buildFinalMessage = useCallback(() => {
    let msg = value;

    // Append clarify selections
    if (clarifyQuestions.length > 0 && Object.keys(clarifySelections).length > 0) {
      const answers = clarifyQuestions
        .map((q, i) =>
          clarifySelections[i] ? `${q.question}: ${clarifySelections[i]}` : null,
        )
        .filter(Boolean);
      if (answers.length > 0) {
        msg += `\n\n[Context: ${answers.join("; ")}]`;
      }
    }

    // Append image description if attached
    if (attachedImage) {
      msg += `\n\n[Attached image: ${attachedImage.name}]\n${attachedImage.dataUrl}`;
    }

    return msg;
  }, [value, clarifyQuestions, clarifySelections, attachedImage]);

  const handleSend = () => {
    const msg = buildFinalMessage();
    if (!msg.trim()) return;
    (onSend ?? sendMessage)(msg);
    setValue("");
    setAttachedImage(null);
    setClarifyQuestions([]);
    setClarifySelections({});
  };

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const file = files[0]; // handle one file at a time

      if (IMAGE_TYPES.includes(file.type)) {
        const dataUrl = await readFileAsDataUrl(file);
        setAttachedImage({ dataUrl, name: file.name, size: file.size });
        textareaRef.current?.focus();
      } else if (
        TEXT_TYPES.includes(file.type) ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".csv") ||
        file.name.endsWith(".txt")
      ) {
        const text = await readFileAsText(file);
        setValue((prev) =>
          prev
            ? `${prev}\n\n--- ${file.name} ---\n${text}`
            : `--- ${file.name} ---\n${text}`,
        );
        textareaRef.current?.focus();
      }
    },
    [],
  );

  // ── File picker (Attach button) ────────────────────────────────────────────
  const handleFilePickerChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (IMAGE_TYPES.includes(file.type)) {
        const dataUrl = await readFileAsDataUrl(file);
        setAttachedImage({ dataUrl, name: file.name, size: file.size });
      } else if (TEXT_TYPES.includes(file.type) || file.name.match(/\.(md|csv|txt|json)$/)) {
        const text = await readFileAsText(file);
        setValue((prev) =>
          prev
            ? `${prev}\n\n--- ${file.name} ---\n${text}`
            : `--- ${file.name} ---\n${text}`,
        );
      }
      textareaRef.current?.focus();
    },
    [],
  );

  // ── Paste handler for screenshots ──────────────────────────────────────────
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => IMAGE_TYPES.includes(item.type));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      setAttachedImage({
        dataUrl,
        name: `screenshot-${Date.now()}.png`,
        size: file.size,
      });
    }
  }, []);

  // ── Clarify questions ──────────────────────────────────────────────────────
  const handleClarify = useCallback(async () => {
    if (!trimmedValue || clarifyLoading) return;
    setClarifyLoading(true);
    setClarifyQuestions([]);
    setClarifySelections({});

    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmedValue }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (Array.isArray(data.questions)) {
        setClarifyQuestions(data.questions.slice(0, 3));
      }
    } catch {
      // silently fail — clarify is a nice-to-have
    } finally {
      setClarifyLoading(false);
    }
  }, [trimmedValue, clarifyLoading]);

  const toggleClarifyOption = useCallback(
    (qIdx: number, option: string) => {
      setClarifySelections((prev) => ({
        ...prev,
        [qIdx]: prev[qIdx] === option ? "" : option,
      }));
    },
    [],
  );

  const dismissClarify = () => {
    setClarifyQuestions([]);
    setClarifySelections({});
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "relative rounded-[1.2rem] border bg-[hsl(var(--app-panel-2)/0.88)] px-3.5 py-3 shadow-[0_18px_42px_-30px_hsl(var(--foreground)/0.55)] backdrop-blur-xl transition-colors",
        isDragging
          ? "border-primary/70 bg-primary/5"
          : "border-border/75",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[1.2rem] bg-primary/10">
          <ImagePlus className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-primary">Drop image or file here</p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,text/plain,text/markdown,text/csv,application/json,.md,.csv,.txt,.json"
        onChange={handleFilePickerChange}
      />

      <div className="flex flex-col gap-2.5">
        {/* Quick-start prompts */}
        {value.length === 0 && !attachedImage && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {t("composer.quickStart")}
            </span>
            {quickStartPrompts.map((item) => (
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

        {/* Clarify questions panel */}
        {clarifyQuestions.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                A few quick questions to help me give you the best answer:
              </span>
              <button
                type="button"
                onClick={dismissClarify}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {clarifyQuestions.map((q, qIdx) => (
                <div key={qIdx}>
                  <p className="mb-1.5 text-xs text-muted-foreground">{q.question}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleClarifyOption(qIdx, opt)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                          clarifySelections[qIdx] === opt
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] text-muted-foreground/60">
              Select options above to refine your request, then hit send.
            </p>
          </div>
        )}

        {/* Attached image preview */}
        {attachedImage && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachedImage.dataUrl}
              alt={attachedImage.name}
              className="h-12 w-12 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {attachedImage.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {(attachedImage.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={handlePaste}
          placeholder={
            isDragging
              ? "Drop here…"
              : attachedImage
                ? "Describe what you'd like to know about this image…"
                : placeholder
          }
          className="min-h-[46px] max-h-[160px] w-full resize-none border-0 bg-transparent px-0 text-sm leading-relaxed shadow-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Web search */}
            <button
              type="button"
              title="Web Search"
              disabled={!plan.features.webSearch}
              onClick={() =>
                plan.features.webSearch && setWebSearchEnabled((v) => !v)
              }
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                webSearchEnabled && plan.features.webSearch
                  ? "bg-primary/15 text-primary"
                  : plan.features.webSearch
                    ? "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Web</span>
            </button>

            {/* Attach file */}
            <button
              type="button"
              title="Attach image or file"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Attach</span>
            </button>

            {/* Clarify */}
            <button
              type="button"
              title="Ask clarifying questions before sending"
              disabled={!trimmedValue || clarifyLoading}
              onClick={handleClarify}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                clarifyQuestions.length > 0
                  ? "bg-primary/15 text-primary"
                  : trimmedValue
                    ? "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              {clarifyLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Clarify</span>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
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
      </div>

      {/* Footer hints */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span>
          {t("composer.shortcutsHint")}
          {" · "}
          <span className="opacity-70">drag & drop or paste images</span>
        </span>
        <span>
          {trimmedValue
            ? `${t("composer.estimatedCost")} ${formatCredits(estimatedCost, currency, locale)} (${modelIdsForEstimate.length} ${modelIdsForEstimate.length === 1 ? t("composer.modelSingular") : t("composer.modelPlural")})`
            : t("composer.estimateAppears")}
        </span>
      </div>
    </div>
  );
}
