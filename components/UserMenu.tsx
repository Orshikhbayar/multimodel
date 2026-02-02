"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Globe,
  HelpCircle,
  Info,
  LogOut,
  Settings,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { LANGUAGE_OPTIONS, PLAN_LABELS } from "@/lib/state/constants";
import { updateLocale, logoutLocal } from "@/lib/state/actions";
import { useUser } from "@/lib/state/hooks";

const shortcutItems = [
  { combo: "Ctrl / ⌘ + K", label: "Start a new chat" },
  { combo: "Ctrl / ⌘ + Enter", label: "Send message" },
  { combo: "Esc", label: "Close dialogs" },
];

export function UserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);

  const planLabel = PLAN_LABELS[user.plan] ?? "Free";
  const languageLabel = useMemo(() => {
    return LANGUAGE_OPTIONS.find((option) => option.id === user.locale)?.label ?? "English";
  }, [user.locale]);

  useEffect(() => {
    setOpen(false);
    setLearnMoreOpen(false);
    setLanguageOpen(false);
    setHelpOpen(false);
  }, [pathname]);

  const handleNavigate = (href: string) => {
    setOpen(false);
    setLearnMoreOpen(false);
    router.push(href);
  };

  const handleLanguageOpen = () => {
    setOpen(false);
    setLearnMoreOpen(false);
    setLanguageOpen(true);
  };

  const handleHelpOpen = () => {
    setOpen(false);
    setLearnMoreOpen(false);
    setHelpOpen(true);
  };

  const handleLogout = () => {
    setOpen(false);
    setLearnMoreOpen(false);
    logoutLocal();
    router.push("/login");
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setLearnMoreOpen(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border bg-card/60 px-3 py-2 text-left hover:bg-muted/40"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {user.avatarInitial}
              </span>
              <span>
                <span className="block text-sm font-semibold">{user.name || "Guest"}</span>
                <span className="block text-xs text-muted-foreground">{planLabel} plan</span>
              </span>
            </span>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-64 rounded-2xl p-2">
          <div className="space-y-1" role="menu" aria-label="User menu">
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {user.email || "Not signed in"}
            </p>
            <MenuItem icon={Settings} label="Settings" onClick={() => handleNavigate("/account")} />
            <MenuItem
              icon={Globe}
              label="Language"
              suffix={languageLabel}
              onClick={handleLanguageOpen}
            />
            <MenuItem icon={HelpCircle} label="Get help" onClick={handleHelpOpen} />
            <Separator className="my-1" />
            <MenuItem
              icon={ArrowUpRight}
              label="Upgrade plan"
              onClick={() => handleNavigate("/account?tab=billing")}
            />
            <MenuItem
              icon={Download}
              label="Download desktop app"
              suffix="Coming soon"
              disabled
              hint="Desktop app is coming soon."
            />
            <MenuItem
              icon={Info}
              label="Learn more"
              suffix={learnMoreOpen ? "–" : ">"}
              onClick={() => setLearnMoreOpen((prev) => !prev)}
            />
            {learnMoreOpen ? (
              <div className="ml-7 space-y-1">
                <SubMenuItem label="About" onClick={() => handleNavigate("/about")} />
                <SubMenuItem label="Privacy policy" onClick={() => handleNavigate("/privacy")} />
                <SubMenuItem label="Terms" onClick={() => handleNavigate("/terms")} />
              </div>
            ) : null}
            <Separator className="my-1" />
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
              role="menuitem"
            >
              <span className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Log out
              </span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={languageOpen} onOpenChange={setLanguageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Language</DialogTitle>
            <DialogDescription>Select your display language.</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={user.locale}
            onValueChange={(value) => updateLocale(value)}
            className="space-y-3"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/40"
              >
                <span>{option.label}</span>
                <RadioGroupItem value={option.id} aria-label={option.label} />
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button onClick={() => setLanguageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Get help</DialogTitle>
            <DialogDescription>We are here to help you succeed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" className="justify-center">
                <a href="mailto:support@multimodel.ai">Contact support</a>
              </Button>
              <Button asChild variant="outline" className="justify-center">
                <Link href="/support">Report a bug</Link>
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-semibold">Keyboard shortcuts</p>
              <div className="mt-3 space-y-2">
                {shortcutItems.map((item) => (
                  <div key={item.combo} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium">
                      {item.combo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  suffix,
  disabled,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  suffix?: string;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
      aria-disabled={disabled}
      role="menuitem"
      title={hint}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
    </button>
  );
}

function SubMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      role="menuitem"
    >
      {label}
    </button>
  );
}
