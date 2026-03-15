"use client";

import { Check, Minus } from "lucide-react";

import { useBillingStore } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";
import { MODELS } from "@/lib/modelCatalog";
import { formatCredits, getIncludedCredits } from "@/lib/billing/utils";

export function PlanCompareTable() {
  const { t, locale } = useI18n();
  const { currency } = useBillingStore();

  const featureRows = [
    {
      label: t("billing.includedMonthlyCreditsLabel"),
      render: (plan: (typeof PLANS)[number]) =>
        formatCredits(getIncludedCredits(plan, currency), currency, locale),
    },
    {
      label: t("billing.maxEnabledModels"),
      render: (plan: (typeof PLANS)[number]) => `${plan.maxEnabledModels}`,
    },
    {
      label: t("billing.webSearch"),
      render: (plan: (typeof PLANS)[number]) =>
        plan.features.webSearch ? <CheckIcon /> : <MinusIcon />,
    },
    {
      label: t("billing.tools"),
      render: (plan: (typeof PLANS)[number]) =>
        plan.features.tools ? <CheckIcon /> : <MinusIcon />,
    },
    {
      label: t("billing.imagesFeature"),
      render: (plan: (typeof PLANS)[number]) =>
        plan.features.images ? <CheckIcon /> : <MinusIcon />,
    },
    {
      label: t("billing.projectsFeature"),
      render: (plan: (typeof PLANS)[number]) =>
        plan.features.projects ? <CheckIcon /> : <MinusIcon />,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border bg-card/60">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t("billing.comparePlans")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("billing.comparePlansDescription")}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                {t("billing.feature")}
              </th>
              {PLANS.map((plan) => (
                <th
                  key={plan.id}
                  className="px-4 py-3 text-left text-xs font-semibold"
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureRows.map((row) => (
              <tr key={row.label} className="border-t">
                <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                {PLANS.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {row.render(plan)}
                  </td>
                ))}
              </tr>
            ))}
            {MODELS.map((model) => (
              <tr key={model.id} className="border-t">
                <td className="px-4 py-3 text-muted-foreground">
                  {model.label}
                </td>
                {PLANS.map((plan) => (
                  <td key={plan.id} className="px-4 py-3">
                    {plan.allowedModelIds.includes(model.id) ? (
                      <CheckIcon />
                    ) : (
                      <MinusIcon />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckIcon() {
  return <Check className="h-4 w-4 text-emerald-500" />;
}

function MinusIcon() {
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}
