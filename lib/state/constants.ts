import type { LanguageOption, UserPlanId } from "./types";

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "en", label: "English", lang: "en" },
  { id: "mn", label: "Монгол", lang: "mn" },
];

export const PLAN_LABELS: Record<UserPlanId, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  team: "Team",
};

export const PLAN_DETAILS: Array<{
  id: UserPlanId;
  name: string;
  price: string;
  description: string;
  highlights: string[];
}> = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    description: "Try the multi-model workspace with core features.",
    highlights: ["2 active models", "Community support", "Basic chat history"],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$19 / mo",
    description: "For regular users who need higher limits.",
    highlights: ["2 active models", "Higher quotas", "Projects support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49 / mo",
    description: "For power users who need more capacity.",
    highlights: ["3 active models", "Image generation", "Priority support"],
  },
  {
    id: "team",
    name: "Team",
    price: "$129 / mo",
    description: "Collaborate across teams with shared context.",
    highlights: ["6 active models", "Largest quotas", "Team workflows"],
  },
];
