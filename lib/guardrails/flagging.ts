import {
  getWorkflowPackById,
  type WorkflowPackId,
} from "@/lib/workflows/packs";

interface GuardrailRule {
  id: string;
  severity: "low" | "medium" | "high";
  pattern: RegExp;
  message: string;
}

interface GuardrailResult {
  flagged: boolean;
  flags: Array<{
    id: string;
    severity: "low" | "medium" | "high";
    message: string;
  }>;
  safeTemplateId: string | null;
  warningText: string | null;
}

const BASE_RULES: GuardrailRule[] = [
  {
    id: "unverified-guarantee",
    severity: "medium",
    pattern: /\b(guaranteed|zero risk|100% compliant)\b/i,
    message: "Contains absolute claims that may be unverifiable.",
  },
  {
    id: "fraudulent-language",
    severity: "high",
    pattern: /\b(fake invoice|forge|backdate|hide payment|bribe)\b/i,
    message: "Contains potentially fraudulent or illegal language.",
  },
  {
    id: "unsafe-advice",
    severity: "high",
    pattern: /\b(bypass law|ignore regulations|evade tax)\b/i,
    message: "Contains potentially non-compliant operational advice.",
  },
];

export function evaluateGuardrails(
  workflowPackId: WorkflowPackId | null,
  text: string,
): GuardrailResult {
  if (!workflowPackId || !text.trim()) {
    return {
      flagged: false,
      flags: [],
      safeTemplateId: null,
      warningText: null,
    };
  }

  const flags = BASE_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => ({
      id: rule.id,
      severity: rule.severity,
      message: rule.message,
    }),
  );

  if (flags.length === 0) {
    return {
      flagged: false,
      flags: [],
      safeTemplateId: null,
      warningText: null,
    };
  }

  const pack = getWorkflowPackById(workflowPackId);
  const safeTemplateId = pack?.safeTemplateId ?? null;
  const warningLines = [
    "[Guardrail flag]",
    ...flags.map((flag) => `- ${flag.id}: ${flag.message}`),
    safeTemplateId
      ? `Use safe template: ${safeTemplateId}`
      : "Use a safe template with fact-only language and explicit assumptions.",
  ];

  return {
    flagged: true,
    flags,
    safeTemplateId,
    warningText: warningLines.join("\n"),
  };
}
