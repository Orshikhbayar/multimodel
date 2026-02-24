"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/Sidebar";
import { useI18n } from "@/lib/i18n";

/**
 * Mobile sidebar wrapper using Sheet drawer
 * Shows hamburger menu + drawer on mobile, hidden on desktop
 */
export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      {/* Mobile hamburger menu - only visible on small screens */}
      <div className="fixed left-4 top-4 z-40 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={t("accessibility.openNavigationMenu")}
          className="h-10 w-10 rounded-xl border-border/75 bg-background/85 shadow-sm backdrop-blur"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[19rem] border-0 bg-transparent p-2">
          <SheetTitle className="sr-only">{t("accessibility.navigation")}</SheetTitle>
          <Sidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
