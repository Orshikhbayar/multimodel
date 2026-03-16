import { Suspense } from "react";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export default function DashboardOverviewPage() {
  return (
    <Suspense fallback={null}>
      <DashboardOverview />
    </Suspense>
  );
}
