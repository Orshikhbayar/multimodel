import { formatCredits } from "@/lib/billing/utils";
import type { Currency } from "@/lib/billing/types";

export function UsageBars({
  includedRemaining,
  includedTotal,
  topUpBalance,
  currency,
}: {
  includedRemaining: number;
  includedTotal: number;
  topUpBalance: number;
  currency: Currency;
}) {
  const includedUsed = Math.max(0, includedTotal - includedRemaining);
  const includedPercent = includedTotal > 0 ? (includedUsed / includedTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Included credits</span>
          <span className="font-medium">
            {formatCredits(includedRemaining, currency)} remaining
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, 100 - includedPercent))}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Included credits reset monthly.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Top-up balance</span>
          <span className="font-medium">{formatCredits(topUpBalance, currency)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: topUpBalance > 0 ? "100%" : "0%" }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Top-ups never expire.</p>
      </div>
    </div>
  );
}
