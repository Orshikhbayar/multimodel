import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  MODE_OPTIONS: [
    {
      value: "smart",
      label: "Auto",
      description: "desc",
      bestFor: "best",
      outputStyle: "out",
    },
  ],
  WORKFLOW_PRESETS: [
    {
      value: "general",
      label: "General",
      description: "desc",
      recommendedMode: "smart",
      instructions: "instr",
    },
  ],
  useChatStore: () => ({
    slots: [
      {
        slotId: "slot-1",
        providerId: "openai",
        modelId: "openai/gpt-4.1",
        label: "GPT-4.1",
        enabled: true,
        status: "idle",
      },
    ],
    activeSlotId: "slot-1",
    mode: "smart",
    instructions: "",
    workflowPreset: "general",
    setActiveSlot: vi.fn(),
    setSlotModel: vi.fn(),
    toggleSlot: vi.fn(),
    setMode: vi.fn(),
    setInstructions: vi.fn(),
    applyWorkflowPreset: vi.fn(),
  }),
}));

vi.mock("@/lib/billing/store", () => ({
  useBillingStore: () => ({
    currentPlanId: "free",
    openUpgradeModal: vi.fn(),
  }),
}));

import { SettingsDrawer } from "@/components/SettingsDrawer";

describe("SettingsDrawer", () => {
  it("renders workspace settings when open", () => {
    render(<SettingsDrawer open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/workspace settings/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /^ai team$/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("GPT-4.1")).toBeInTheDocument();
  });
});
