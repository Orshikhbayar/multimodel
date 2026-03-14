import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockSendMessage, mockStopAllStreams } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  mockStopAllStreams: vi.fn(),
}));

vi.mock("@/lib/hooks/useChatActions", () => ({
  useChatActions: () => ({
    sendMessage: mockSendMessage,
    stopAllStreams: mockStopAllStreams,
  }),
}));

vi.mock("@/components/ModelPicker", () => ({
  ModelPicker: ({ trigger }: { trigger: React.ReactNode }) => (
    <div>{trigger}</div>
  ),
}));

import { Composer } from "@/components/Composer";

describe("Composer", () => {
  it("sends message on ctrl+enter", () => {
    render(
      <Composer
        modelId="openai/gpt-4.1"
        modelLabel="GPT-4.1"
        enabledModelIds={["openai/gpt-4.1"]}
        currency="USD"
        lockedModelIds={[]}
        onSelectModel={vi.fn()}
        onSelectLocked={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "hello" } });
    fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });

    expect(mockSendMessage).toHaveBeenCalledWith("hello");
  });

  it("uses explicit onSend callback when provided", () => {
    const onSend = vi.fn();

    render(
      <Composer
        onSend={onSend}
        modelId="openai/gpt-4.1"
        modelLabel="GPT-4.1"
        enabledModelIds={["openai/gpt-4.1"]}
        currency="USD"
        lockedModelIds={[]}
        onSelectModel={vi.fn()}
        onSelectLocked={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: "hello" } });
    fireEvent.keyDown(textbox, { key: "Enter", metaKey: true });

    expect(onSend).toHaveBeenCalledWith("hello");
  });
});
