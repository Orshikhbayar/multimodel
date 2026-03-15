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
}> = [
  {
    id: "free",
    name: "Free",
    price: "$0",
  },
  {
    id: "plus",
    name: "Plus",
    price: "$19 / mo",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49 / mo",
  },
  {
    id: "team",
    name: "Team",
    price: "$129 / mo",
  },
];
