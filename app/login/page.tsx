import { redirect } from "next/navigation";

export default function LegacyLoginRedirectPage() {
  redirect("/auth/login");
}
