import { redirect } from "next/navigation";

export default function LegacyPricingRedirectPage() {
  redirect("/dashboard/plans");
}
