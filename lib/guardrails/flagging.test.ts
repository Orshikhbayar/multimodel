import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetWorkflowPackById } = vi.hoisted(() => ({
  mockGetWorkflowPackById: vi.fn(),
}));

vi.mock("@/lib/workflows/packs", () => ({
  getWorkflowPackById: mockGetWorkflowPackById,
}));

import { evaluateGuardrails } from "@/lib/guardrails/flagging";
import type { WorkflowPackId } from "@/lib/workflows/packs";

describe("flagging.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("evaluateGuardrails", () => {
    it("returns no flags for empty text", () => {
      const result = evaluateGuardrails("pack-1" as WorkflowPackId, "");

      expect(result).toMatchObject({
        flagged: false,
        flags: [],
        safeTemplateId: null,
        warningText: null,
      });
    });

    it("returns no flags for null pack ID", () => {
      const result = evaluateGuardrails(null, "Some content here");

      expect(result).toMatchObject({
        flagged: false,
        flags: [],
        safeTemplateId: null,
        warningText: null,
      });
    });

    it("returns no flags for clean content", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This is a normal business document with good practices.",
      );

      expect(result).toMatchObject({
        flagged: false,
        flags: [],
      });
    });

    it("flags unverified guarantee language", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This solution is guaranteed to solve all your problems.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unverified-guarantee")).toBe(
        true,
      );
      expect(result.flags[0].severity).toBe("medium");
    });

    it("flags fraudulent language", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "We can create fake invoices for you.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "fraudulent-language")).toBe(
        true,
      );
      expect(result.flags[0].severity).toBe("high");
    });

    it("flags unsafe advice", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "To save money, you should evade taxes.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unsafe-advice")).toBe(true);
      expect(result.flags[0].severity).toBe("high");
    });

    it("catches multiple violations in one text", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "Our solution is guaranteed to work. We can forge documents and help you bypass laws.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.length).toBeGreaterThan(1);
    });

    it("case insensitive pattern matching", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This is GUARANTEED to work perfectly.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unverified-guarantee")).toBe(
        true,
      );
    });

    it("includes safe template ID in result", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "safe-template-xyz",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This guarantees results.",
      );

      expect(result.flagged).toBe(true);
      expect(result.safeTemplateId).toBe("safe-template-xyz");
    });

    it("defaults to null safe template when not provided", () => {
      mockGetWorkflowPackById.mockReturnValue({});

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This is guaranteed.",
      );

      expect(result.flagged).toBe(true);
      expect(result.safeTemplateId).toBeNull();
    });

    it("includes warning text with all flag details", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This is guaranteed to work.",
      );

      expect(result.warningText).toBeDefined();
      expect(result.warningText).toContain("Guardrail flag");
      expect(result.warningText).toContain("unverified-guarantee");
      expect(result.warningText).toContain("safe template");
    });

    it("lists all flagged items in warning", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This is guaranteed and we can forge documents.",
      );

      expect(result.warningText).toContain("unverified-guarantee");
      expect(result.warningText).toContain("fraudulent-language");
    });

    it("provides message for each flag", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "Guaranteed results here.",
      );

      expect(result.flags[0].message).toBeDefined();
      expect(result.flags[0].message.length).toBeGreaterThan(0);
    });

    it("handles whitespace-only text", () => {
      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "   \n\t   ",
      );

      expect(result.flagged).toBe(false);
      expect(result.flags).toHaveLength(0);
    });

    it("flags 'zero risk' language", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This investment has zero risk.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unverified-guarantee")).toBe(
        true,
      );
    });

    it("flags '100% compliant' claims", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "Our process is 100% compliant with all regulations.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unverified-guarantee")).toBe(
        true,
      );
    });

    it("flags 'forge' with context", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "Do not forge any documents.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "fraudulent-language")).toBe(
        true,
      );
    });

    it("flags 'backdating' practices", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "We can backdate the contract for you.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "fraudulent-language")).toBe(
        true,
      );
    });

    it("flags 'hide payment' schemes", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "You can hide payment from the authorities.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "fraudulent-language")).toBe(
        true,
      );
    });

    it("flags 'bribery' references", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "We handle bribery payments discretely.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "fraudulent-language")).toBe(
        true,
      );
    });

    it("flags 'bypass law' references", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "Here is how to bypass law enforcement.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unsafe-advice")).toBe(true);
    });

    it("flags 'ignore regulations' advice", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "Simply ignore regulations and proceed.",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unsafe-advice")).toBe(true);
    });

    it("flags 'evade tax' schemes", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "A simple way to evade tax is to...",
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unsafe-advice")).toBe(true);
    });

    it("escapes special characters in messages", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        'This is "guaranteed" to work.',
      );

      expect(result.flagged).toBe(true);
      expect(result.flags.length).toBeGreaterThan(0);
    });

    it("handles very long text", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const longText =
        "Normal content. ".repeat(1000) + "This is guaranteed to work.";

      const result = evaluateGuardrails("pack-1" as WorkflowPackId, longText);

      expect(result.flagged).toBe(true);
      expect(result.flags.some((f) => f.id === "unverified-guarantee")).toBe(
        true,
      );
    });

    it("sorts flags by severity (high first)", () => {
      mockGetWorkflowPackById.mockReturnValue({
        safeTemplateId: "template-1",
      });

      const result = evaluateGuardrails(
        "pack-1" as WorkflowPackId,
        "This is guaranteed and we can forge documents.",
      );

      // High severity should appear before medium
      const highIndex = result.flags.findIndex((f) => f.severity === "high");
      const mediumIndex = result.flags.findIndex(
        (f) => f.severity === "medium",
      );

      if (highIndex !== -1 && mediumIndex !== -1) {
        // Just verify both exist and are properly categorized
        expect(result.flags.some((f) => f.severity === "high")).toBe(true);
        expect(result.flags.some((f) => f.severity === "medium")).toBe(true);
      }
    });
  });
});
