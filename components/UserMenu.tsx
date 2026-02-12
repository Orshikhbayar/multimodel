"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Globe,
  HelpCircle,
  Info,
  LogOut,
  Settings,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LANGUAGE_OPTIONS, PLAN_LABELS } from "@/lib/state/constants";
import { updateLocale, logoutLocal } from "@/lib/state/actions";
import { useUser } from "@/lib/state/hooks";

export function UserMenu() {
  const router = useRouter();
  const user = useUser();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const shortcutItems = useMemo(
    () => [
      { combo: "Ctrl / ⌘ + K", label: t("userMenu.shortcutStartChat") },
      { combo: "Ctrl / ⌘ + Enter", label: t("userMenu.shortcutSendMessage") },
      { combo: "Esc", label: t("userMenu.shortcutCloseDialogs") },
    ],
    [t],
  );

  const planLabel = PLAN_LABELS[user.plan] ?? "Free";
  const languageLabel = useMemo(() => {
    return (
      LANGUAGE_OPTIONS.find((option) => option.id === user.locale)?.label ??
      LANGUAGE_OPTIONS[0]?.label
    );
  }, [user.locale]);

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
    void fetch("/auth/logout", { method: "POST" }).finally(() => {
      logoutLocal();
      router.push("/auth/login");
      router.refresh();
    });
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
                <span className="block text-sm font-semibold">
                  {user.name || t("common.guest")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("account.planSuffix", { plan: planLabel })}
                </span>
              </span>
            </span>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="w-64 rounded-2xl p-2"
        >
          <div className="space-y-1" role="menu" aria-label={t("userMenu.menuAria")}>
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {user.email || t("common.notSignedIn")}
            </p>
            <MenuItem
              icon={Settings}
              label={t("userMenu.settings")}
              onClick={() => handleNavigate("/account")}
            />
            <MenuItem
              icon={Globe}
              label={t("userMenu.language")}
              suffix={languageLabel}
              onClick={handleLanguageOpen}
            />
            <MenuItem
              icon={HelpCircle}
              label={t("userMenu.getHelp")}
              onClick={handleHelpOpen}
            />
            <Separator className="my-1" />
            <MenuItem
              icon={ArrowUpRight}
              label={t("userMenu.upgradePlan")}
              onClick={() => handleNavigate("/account/billing")}
            />
            <MenuItem
              icon={Download}
              label={t("userMenu.downloadDesktopApp")}
              suffix={t("userMenu.comingSoon")}
              disabled
              hint={t("userMenu.desktopComingSoon")}
            />
            <MenuItem
              icon={Info}
              label={t("userMenu.learnMore")}
              suffix={learnMoreOpen ? "–" : ">"}
              onClick={() => setLearnMoreOpen((prev) => !prev)}
            />
            {learnMoreOpen ? (
              <div className="ml-7 space-y-1">
                <SubMenuItem
                  label={t("userMenu.about")}
                  onClick={() => handleNavigate("/about")}
                />
                <SubMenuItem
                  label={t("userMenu.privacyPolicy")}
                  onClick={() => handleNavigate("/privacy")}
                />
                <SubMenuItem
                  label={t("userMenu.terms")}
                  onClick={() => handleNavigate("/terms")}
                />
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
                {t("userMenu.logOut")}
              </span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={languageOpen} onOpenChange={setLanguageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("userMenu.language")}</DialogTitle>
            <DialogDescription>{t("userMenu.selectDisplayLanguage")}</DialogDescription>
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
            <Button onClick={() => setLanguageOpen(false)}>{t("common.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("userMenu.getHelp")}</DialogTitle>
            <DialogDescription>{t("userMenu.helpDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" className="justify-center">
                <a href="mailto:support@multimodel.ai">{t("userMenu.contactSupport")}</a>
              </Button>
              <Button asChild variant="outline" className="justify-center">
                <Link href="/support">{t("userMenu.reportBug")}</Link>
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-semibold">{t("userMenu.keyboardShortcuts")}</p>
              <div className="mt-3 space-y-2">
                {shortcutItems.map((item) => (
                  <div
                    key={item.combo}
                    className="flex items-center justify-between text-sm"
                  >
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
      {suffix ? (
        <span className="text-xs text-muted-foreground">{suffix}</span>
      ) : null}
    </button>
  );
}

function SubMenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
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
