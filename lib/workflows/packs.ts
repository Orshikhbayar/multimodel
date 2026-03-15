import type { InteractionMode } from "@/lib/types";

export type WorkflowPackId =
  | "importer-solo-seller"
  | "online-seller"
  | "procurement-tender";

export type WorkflowInputType = "text" | "number" | "textarea";

export interface WorkflowInputField {
  key: string;
  label: string;
  placeholder: string;
  type: WorkflowInputType;
  required?: boolean;
}

export interface WorkflowPack {
  id: WorkflowPackId;
  title: string;
  summary: string;
  weeklyLoop: string;
  recommendedMode: InteractionMode;
  defaultInstructions: string;
  safeTemplateId: string;
  starterTemplateTitle: string;
  inputFields: WorkflowInputField[];
  promptTemplate: string;
}

export const WORKFLOW_PACKS: WorkflowPack[] = [
  {
    id: "importer-solo-seller",
    title: "Importer / Solo Seller",
    summary:
      "Optimize margin and reorder decisions with clear supplier follow-up actions.",
    weeklyLoop:
      "Weekly margin health, reorder recommendation, and supplier follow-up draft.",
    recommendedMode: "expert",
    defaultInstructions:
      "Be practical and numeric. Prioritize landed cost clarity, margin tradeoffs, reorder timing, and supplier communication. Always end with next actions.",
    safeTemplateId: "safe-importer-weekly-review",
    starterTemplateTitle: "Importer Weekly Margin + Reorder Review",
    inputFields: [
      {
        key: "product_name",
        label: "Product name",
        placeholder: "Wireless earbuds",
        type: "text",
        required: true,
      },
      {
        key: "unit_cost",
        label: "Unit cost (USD)",
        placeholder: "12.5",
        type: "number",
        required: true,
      },
      {
        key: "shipping_and_fees",
        label: "Shipping + duty/tax per unit (USD)",
        placeholder: "3.8",
        type: "number",
        required: true,
      },
      {
        key: "current_stock",
        label: "Current stock (units)",
        placeholder: "180",
        type: "number",
        required: true,
      },
      {
        key: "weekly_sales",
        label: "Weekly sales (units)",
        placeholder: "95",
        type: "number",
        required: true,
      },
      {
        key: "supplier_notes",
        label: "Supplier notes",
        placeholder: "MOQ 200, lead time 12 days",
        type: "textarea",
      },
    ],
    promptTemplate:
      "Act as an operations copilot for a small importer.\n\nContext:\n- Product: {{product_name}}\n- Unit cost (USD): {{unit_cost}}\n- Shipping+duty per unit (USD): {{shipping_and_fees}}\n- Current stock: {{current_stock}}\n- Weekly sales: {{weekly_sales}}\n- Supplier notes: {{supplier_notes}}\n\nDeliver:\n1) Landed cost and three pricing options (conservative, target, aggressive)\n2) Reorder recommendation with stockout risk explanation\n3) Supplier follow-up message draft\n4) Next 7-day action list",
  },
  {
    id: "online-seller",
    title: "Online Seller",
    summary:
      "Build a reusable DM/FAQ reply bank and reduce repetitive support load.",
    weeklyLoop:
      "Weekly FAQ trends, updated reply bank, and prioritized response scripts.",
    recommendedMode: "debate",
    defaultInstructions:
      "Write concise customer-facing language. Prioritize clear policies, conversion-safe tone, and reusable response templates.",
    safeTemplateId: "safe-online-seller-reply-bank",
    starterTemplateTitle: "Online Seller Reply Bank Refresh",
    inputFields: [
      {
        key: "store_type",
        label: "Store type",
        placeholder: "Beauty products ecommerce",
        type: "text",
        required: true,
      },
      {
        key: "top_faqs",
        label: "Top FAQs this week",
        placeholder: "Shipping delays, return policy, payment options",
        type: "textarea",
        required: true,
      },
      {
        key: "policy_notes",
        label: "Policy notes",
        placeholder: "Returns accepted within 7 days with original packaging",
        type: "textarea",
        required: true,
      },
      {
        key: "tone_preference",
        label: "Brand tone",
        placeholder: "Friendly and premium",
        type: "text",
      },
      {
        key: "promo_focus",
        label: "This week's promo focus",
        placeholder: "Bundle offers for repeat buyers",
        type: "text",
      },
    ],
    promptTemplate:
      "Act as a support and sales assistant for an online seller.\n\nContext:\n- Store type: {{store_type}}\n- Top FAQs: {{top_faqs}}\n- Policy notes: {{policy_notes}}\n- Tone preference: {{tone_preference}}\n- Promo focus: {{promo_focus}}\n\nDeliver:\n1) FAQ insight summary (top issues and likely causes)\n2) Reply bank with 10 reusable DM responses\n3) Escalation guide (when to hand off to human)\n4) Next-week improvements for faster response time",
  },
  {
    id: "procurement-tender",
    title: "Procurement / Tender",
    summary:
      "Produce structured bid artifacts and a weekly execution checklist.",
    weeklyLoop:
      "Weekly deadline risk review, requirement checklist, and updated draft outputs.",
    recommendedMode: "expert",
    defaultInstructions:
      "Be structured and compliance-aware. Use checklist format, highlight missing requirements, and avoid unsupported claims.",
    safeTemplateId: "safe-procurement-checklist",
    starterTemplateTitle: "Tender Response Checklist + Draft",
    inputFields: [
      {
        key: "tender_title",
        label: "Tender title",
        placeholder: "Municipal IT maintenance contract",
        type: "text",
        required: true,
      },
      {
        key: "deadline",
        label: "Submission deadline",
        placeholder: "2026-03-15",
        type: "text",
        required: true,
      },
      {
        key: "mandatory_requirements",
        label: "Mandatory requirements",
        placeholder: "ISO cert, 3 references, signed declarations",
        type: "textarea",
        required: true,
      },
      {
        key: "evaluation_criteria",
        label: "Evaluation criteria",
        placeholder: "40% price, 30% approach, 30% experience",
        type: "textarea",
      },
      {
        key: "team_notes",
        label: "Team notes",
        placeholder: "Legal review pending for section 4",
        type: "textarea",
      },
    ],
    promptTemplate:
      "Act as a procurement proposal copilot.\n\nContext:\n- Tender title: {{tender_title}}\n- Deadline: {{deadline}}\n- Mandatory requirements: {{mandatory_requirements}}\n- Evaluation criteria: {{evaluation_criteria}}\n- Team notes: {{team_notes}}\n\nDeliver:\n1) Requirement compliance checklist (met/missing/owner)\n2) Risk list with mitigations before deadline\n3) Structured draft outline for submission\n4) Next 7-day action plan with priority order",
  },
];

const packById = new Map(WORKFLOW_PACKS.map((pack) => [pack.id, pack]));

export function getWorkflowPackById(id: WorkflowPackId) {
  return packById.get(id);
}

export function isWorkflowPackId(value: unknown): value is WorkflowPackId {
  if (typeof value !== "string") return false;
  return packById.has(value as WorkflowPackId);
}

const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function buildWorkflowPrompt(
  pack: WorkflowPack,
  values: Record<string, string>,
) {
  return pack.promptTemplate.replace(TOKEN_REGEX, (_token, rawKey: string) => {
    const key = rawKey.trim();
    const value = values[key]?.trim();
    return value && value.length > 0 ? value : "not provided";
  });
}
