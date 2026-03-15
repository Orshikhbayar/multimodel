import { Suspense } from "react";
import { DashboardBilling } from "@/components/dashboard/DashboardBilling";

export default function DashboardBillingPage() {
  return (
    <Suspense>
      <DashboardBilling />
    </Suspense>
  );
}
