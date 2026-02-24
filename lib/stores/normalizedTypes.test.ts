import { describe, expect, it } from "vitest";

import {
  createEmptyEntities,
  denormalizeAllConversations,
  denormalizeConversation,
  denormalizeMessage,
  denormalizeRun,
  normalizeConversation,
  normalizeConversations,
} from "@/lib/stores/normalizedTypes";
import type { Conversation } from "@/lib/types";

const sampleConversation: Conversation = {
  id: "conv-1",
  title: "Test",
  createdAt: Date.now(),
  messages: [
    {
      id: "msg-1",
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      runs: [
        {
          id: "run-1",
          model: "GPT-4",
          status: "done",
          text: "Hello",
        },
      ],
    },
  ],
};

describe("normalizedTypes", () => {
  it("creates empty entity state", () => {
    const entities = createEmptyEntities();
    expect(entities.conversationIds).toEqual([]);
    expect(entities.conversations).toEqual({});
  });

  it("normalizes and denormalizes a conversation", () => {
    const normalized = normalizeConversation(sampleConversation);
    const entities = {
      ...createEmptyEntities(),
      ...normalized,
      conversationIds: [sampleConversation.id],
    };

    expect(denormalizeRun(entities, "run-1")?.text).toBe("Hello");
    expect(denormalizeMessage(entities, "msg-1")?.runs?.[0]?.id).toBe("run-1");
    expect(denormalizeConversation(entities, "conv-1")?.id).toBe("conv-1");
  });

  it("normalizes and denormalizes multiple conversations", () => {
    const entities = normalizeConversations([sampleConversation]);
    const all = denormalizeAllConversations(entities);

    expect(all).toHaveLength(1);
    expect(all[0].messages).toHaveLength(1);
  });
});
