import type { LanguageOption, UserPlanId } from "./types";

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "en", label: "English", lang: "en" },
  { id: "mn", label: "Монгол", lang: "mn" },
];

export const PLAN_LABELS: Record<UserPlanId, string> = {
  free: "Free",
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
    id: "pro",
    name: "Pro",
    price: "$20 / mo",
    description: "For power users who need more capacity.",
    highlights: ["6 active models", "Priority support", "Advanced workflows"],
  },
  {
    id: "team",
    name: "Team",
    price: "$45 / seat",
    description: "Collaborate across teams with shared context.",
    highlights: ["Unlimited models", "Shared projects", "Team analytics"],
  },
];
