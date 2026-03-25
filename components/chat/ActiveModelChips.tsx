"use client";

import { Plus } from "lucide-react";

import { ModelGlyph } from "@/components/ModelGlyph";
import { useModelStore, useSettingsStore } from "@/lib/stores";
import { useI18n } from "@/lib/i18n";

interface ActiveModelChipsProps {
  onOpenSettings: () => void;
}

export function ActiveModelChips({ onOpenSettings }: ActiveModelChipsProps) {
  const { t } = useI18n();
  const { slots, toggleSlot } = useModelStore();
  const { mode } = useSettingsStore();
  const enabledSlots = slots.filter((s) => s.enabled);

  if (mode === "single") return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {enabledSlots.map((slot) => (
        <button
          key={slot.slotId}
          type="button"
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium hover:bg-accent transition"
          onClick={() => toggleSlot(slot.slotId)}
          title={slot.label}
        >
          <ModelGlyph modelId={slot.modelId} size="sm" />
          <span className="truncate max-w-[80px]">{slot.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-dashed bg-transparent px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent transition"
        onClick={onOpenSettings}
      >
        <Plus className="h-3 w-3" />
        {t("settings.change")}
      </button>
    </div>
  );
}
