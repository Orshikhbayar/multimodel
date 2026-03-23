"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Gauge, Layers, Shield } from "lucide-react";

import { cn } from "@/lib/utils";

const DASHBOARD_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/dashboard/usage", label: "Usage", icon: Gauge },
  { href: "/dashboard/limits", label: "Limits", icon: Shield },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/plans", label: "Plans", icon: Layers },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

export function DashboardSubnav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="border-b border-border/70 px-4 py-3 md:hidden">
        <ul className="flex gap-2 overflow-x-auto">
          {DASHBOARD_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                    active
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <aside className="hidden w-56 shrink-0 border-r border-border/70 bg-background/40 md:block">
        <div className="px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dashboard
          </p>
          <nav className="mt-3">
            <ul className="space-y-1">
              {DASHBOARD_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}
