import type { LanguageOption, UserPlanId } from "./types";

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "en", label: "English", lang: "en" },
  { id: "mn", label: "Монгол", lang: "mn" },
];

export const PLAN_LABELS: Record<UserPlanId, string> = {
  free: "Free",
  plus: "Pro", // legacy mapping
  pro: "Pro",
  team: "Pro", // legacy mapping
};

export const PLAN_DETAILS: Array<{
  id: UserPlanId;
  name: string;
  price: string;
}> = [
  {
    id: "free",
    name: "Free",
    price: "$0",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12 / mo",
  },
];
