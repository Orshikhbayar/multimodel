"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X, ArrowUpRight } from "lucide-react";
import Link from "next/link";

/**
 * Lightweight banner that sits above the chat input when the user
 * is approaching or has exceeded their daily token limit.
 *
 * Fetches /api/usage/limits on mount and every 5 minutes.
 * Renders nothing if usage is below 80% or if the user is on an
 * unlimited plan (Pro with 0 daily cap).
 */
export function UsageLimitBanner() {
  const [state, setState] = useState<{
    percentUsed: number;
    planId: string;
    resetsIn: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch("/api/usage/limits");
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;

        // Only show if there IS a daily cap and usage >= 80%
        if (data.daily.tokenLimit > 0 && data.daily.percentUsed >= 80) {
          const diff = new Date(data.daily.resetsAt).getTime() - Date.now();
          const hours = Math.floor(diff / 3_600_000);
          const minutes = Math.floor((diff % 3_600_000) / 60_000);
          const resetsIn = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

          setState({
            percentUsed: data.daily.percentUsed,
            planId: data.plan.id,
            resetsIn,
          });
        } else {
          setState(null);
        }
      } catch {
        // Silently fail — this is informational only
      }
    }

    check();
    const interval = setInterval(check, 5 * 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!state || dismissed) return null;

  const exceeded = state.percentUsed >= 100;
  const isFreePlan = state.planId === "free";

  return (
    <div
      className={`mx-auto flex w-full max-w-3xl items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        exceeded
          ? "border-red-500/30 bg-red-500/10 text-red-500"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600"
      }`}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {exceeded
          ? `Daily limit reached. Resets in ${state.resetsIn}.`
          : `${state.percentUsed}% of daily limit used. Resets in ${state.resetsIn}.`}
      </span>
      {isFreePlan && (
        <Link
          href="/dashboard/plans"
          className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:opacity-80"
        >
          Upgrade
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 rounded p-0.5 hover:bg-black/10"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
