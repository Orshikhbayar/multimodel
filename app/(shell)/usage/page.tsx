import { redirect } from "next/navigation";

export default function LegacyUsageRedirectPage() {
  redirect("/dashboard/usage");
}
