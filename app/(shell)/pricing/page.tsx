import { PricingTiers } from "@/components/billing/PricingTiers";
import { PlanCompareTable } from "@/components/billing/PlanCompareTable";

export default function PricingPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <PricingTiers />
      <PlanCompareTable />
    </div>
  );
}
