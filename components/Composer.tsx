"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Paperclip,
  Sparkles,
  Wrench,
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ModelPicker } from "@/components/ModelPicker";
import { useChatActions } from "@/lib/hooks/useChatActions";

interface ComposerProps {
  onSend?: (value: string) => void;
  modelId: string;
  modelLabel: string;
  lockedModelIds: string[];
  onSelectModel: (modelId: string) => void;
  onSelectLocked: (modelId: string) => void;
}

export function Composer({
  onSend,
  modelId,
  modelLabel,
  lockedModelIds,
  onSelectModel,
  onSelectLocked,
}: ComposerProps) {
  const { sendMessage } = useChatActions();
  const [value, setValue] = useState("");
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [webEnabled, setWebEnabled] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxHeight = 160;

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
    if (!value.trim()) return;
    (onSend ?? sendMessage)(value);
    setValue("");
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[hsl(var(--app-panel-2))] px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1 hover:border-foreground/20 hover:bg-muted/60 focus-within:border-foreground/20">
            <Paperclip className="h-4 w-4" />
            <span className="hidden sm:inline">Attach</span>
            <Input
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setAttachmentName(file ? file.name : null);
              }}
            />
          </label>
          {attachmentName && (
            <span className="rounded bg-muted px-2 py-1 text-[11px]">
              {attachmentName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ToggleButton
            label="Web"
            icon={<Globe className="h-3.5 w-3.5" />}
            active={webEnabled}
            onClick={() => setWebEnabled((prev) => !prev)}
          />
          <ToggleButton
            label="Tools"
            icon={<Wrench className="h-3.5 w-3.5" />}
            active={toolsEnabled}
            onClick={() => setToolsEnabled((prev) => !prev)}
          />
          <ToggleButton
            label="Enhance"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            active={enhanceEnabled}
            onClick={() => setEnhanceEnabled((prev) => !prev)}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Message the team…"
          className="min-h-[44px] max-h-[160px] flex-1 resize-none border-0 bg-transparent text-sm shadow-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0"
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
            popoverSide="bottom"
            popoverAlign="end"
            trigger={
              <button
                type="button"
                className="relative flex items-center gap-2 rounded-full border bg-[hsl(var(--app-panel))] px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted/40"
              >
                <span className="max-w-[120px] truncate">{modelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            }
          />
          <Button onClick={handleSend} size="icon" className="rounded-xl">
            <ArrowUp className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
      <div className="mt-1 pb-1 text-[11px] text-muted-foreground">
        Shift+Enter for newline · Cmd/Ctrl+Enter to send
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-[10px] uppercase tracking-wide transition hover:border-foreground/20 focus-visible:border-foreground/20",
        active
          ? "bg-primary text-primary-foreground hover:border-primary-foreground/30 focus-visible:border-primary-foreground/30"
          : "bg-[hsl(var(--app-panel))] text-muted-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
