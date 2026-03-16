import { describe, expect, it } from "vitest";

import {
  countTokens,
  countMessageTokens,
  calculateRunCostUsd,
  estimateMessageCostUsd,
  verifyTokenEstimate,
} from "@/lib/tokenCounter";

describe("tokenCounter", () => {
  describe("countTokens", () => {
    it("returns at least 1 for non-empty text", () => {
      expect(countTokens("hello")).toBeGreaterThan(0);
    });

    it("returns 1 for empty string (minimum floor)", () => {
      expect(countTokens("")).toBe(1);
    });

    it("estimates English prose at roughly 1 token per 4 chars", () => {
      const text = "The quick brown fox jumps over the lazy dog."; // 44 chars → ~11 tokens
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThanOrEqual(8);
      expect(tokens).toBeLessThanOrEqual(16);
    });

    it("gives CJK text more tokens per character than ASCII", () => {
      const ascii = "a".repeat(40);       // 40 ASCII chars
      const cjk   = "中".repeat(40);      // 40 CJK chars — each ≈ 1 token
      expect(countTokens(cjk)).toBeGreaterThan(countTokens(ascii));
    });

    it("handles emoji and non-BMP codepoints without throwing", () => {
      expect(() => countTokens("Hello 🌍 world 🚀")).not.toThrow();
      expect(countTokens("Hello 🌍 world 🚀")).toBeGreaterThan(0);
    });

    it("handles mixed CJK + ASCII text", () => {
      const mixed = "Hello 世界 foo bar";
      expect(countTokens(mixed)).toBeGreaterThan(0);
    });
  });

  describe("countMessageTokens", () => {
    it("returns more tokens than counting content alone (message overhead)", () => {
      const messages = [
        { role: "user", content: "What is 2 + 2?" },
        { role: "assistant", content: "4." },
      ];
      const fromContent = messages.reduce(
        (sum, m) => sum + countTokens(m.content),
        0,
      );
      expect(countMessageTokens(messages)).toBeGreaterThan(fromContent);
    });

    it("returns at least 1 for an empty messages array", () => {
      expect(countMessageTokens([])).toBeGreaterThanOrEqual(1);
    });

    it("handles single-message array", () => {
      const messages = [{ role: "user", content: "Hello" }];
      expect(countMessageTokens(messages)).toBeGreaterThan(0);
    });
  });

  describe("calculateRunCostUsd", () => {
    it("returns 0 for zero tokens", () => {
      expect(calculateRunCostUsd("openai/gpt-4o", 0, 0)).toBe(0);
    });

    it("returns a positive number for non-zero tokens", () => {
      expect(calculateRunCostUsd("openai/gpt-4o", 1000, 500)).toBeGreaterThan(0);
    });

    it("charges more for output than input on high-cost models", () => {
      // claude-opus-4: $15/1M input vs $75/1M output
      const inputOnly  = calculateRunCostUsd("anthropic/claude-opus-4", 1000, 0);
      const outputOnly = calculateRunCostUsd("anthropic/claude-opus-4", 0, 1000);
      expect(outputOnly).toBeGreaterThan(inputOnly);
    });

    it("costs less for gpt-4o-mini than gpt-4o for same token count", () => {
      const tokens = { inputTokens: 1000, outputTokens: 500 };
      const mini = calculateRunCostUsd("openai/gpt-4o-mini", tokens.inputTokens, tokens.outputTokens);
      const full = calculateRunCostUsd("openai/gpt-4o", tokens.inputTokens, tokens.outputTokens);
      expect(mini).toBeLessThan(full);
    });

    it("falls back gracefully for unknown model ID", () => {
      expect(() => calculateRunCostUsd("unknown/model", 100, 100)).not.toThrow();
      expect(calculateRunCostUsd("unknown/model", 100, 100)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("estimateMessageCostUsd", () => {
    it("returns a positive number for non-empty content", () => {
      expect(estimateMessageCostUsd("Hello world", "openai/gpt-4o")).toBeGreaterThan(0);
    });

    it("longer messages cost more than shorter ones", () => {
      const short = estimateMessageCostUsd("Hi", "openai/gpt-4o");
      const long  = estimateMessageCostUsd("Hi ".repeat(500), "openai/gpt-4o");
      expect(long).toBeGreaterThan(short);
    });
  });

  describe("verifyTokenEstimate", () => {
    it("returns zero error when estimate matches actual", () => {
      const actual    = countTokens("hello world");
      const { errorPercent } = verifyTokenEstimate("hello world", actual);
      expect(errorPercent).toBe(0);
    });

    it("returns a percentage error for mismatches", () => {
      const { errorPercent } = verifyTokenEstimate("hello world", 999);
      expect(errorPercent).toBeGreaterThan(0);
    });

    it("handles actualTokens = 0 without dividing by zero", () => {
      expect(() => verifyTokenEstimate("text", 0)).not.toThrow();
    });
  });
});
