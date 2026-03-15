import { redirect } from "next/navigation";

export default function LegacyAccountBillingRedirectPage() {
  redirect("/dashboard/billing");
}
