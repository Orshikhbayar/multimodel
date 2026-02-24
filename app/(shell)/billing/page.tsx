import { redirect } from "next/navigation";

export default function LegacyBillingRedirectPage() {
  redirect("/dashboard/billing");
}
