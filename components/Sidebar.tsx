"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowLeftRight,
  CreditCard,
  FolderKanban,
  Home,
  MessageSquare,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Sun,
  Tag,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { UserMenu } from "@/components/UserMenu";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { formatCredits, getIncludedCredits } from "@/lib/billing/utils";
import { useI18n } from "@/lib/i18n";
import { useChatStore } from "@/lib/store";
import { useAppSettingsStore } from "@/lib/state/settingsStore";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const setAppTheme = useAppSettingsStore((state) => state.setTheme);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pendingRename, setPendingRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [chatQuery, setChatQuery] = useState("");
  const {
    conversations,
    currentConversationId,
    createConversation,
    setCurrentConversation,
    updateConversationTitle,
    removeConversation,
  } = useChatStore();
  const {
    currentPlanId,
    currency,
    includedCreditsRemaining,
    topUpCreditsBalance,
    resetPeriodIfNeeded,
  } = useBillingStore();

  useEffect(() => {
    resetPeriodIfNeeded();
  }, [resetPeriodIfNeeded]);

  const handleNewChat = useCallback(() => {
    const id = createConversation(t("navigation.untitledChat"));
    setCurrentConversation(id);
    router.push("/");
    onNavigate?.();
  }, [createConversation, onNavigate, router, setCurrentConversation, t]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleNewChat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNewChat]);

  const navItems = useMemo(
    () => [
      { href: "/", label: t("navigation.chat"), icon: Home },
      { href: "/projects", label: t("navigation.projects"), icon: FolderKanban },
      { href: "/account/billing", label: t("navigation.billing"), icon: CreditCard },
      { href: "/pricing", label: t("navigation.pricing"), icon: Tag },
    ],
    [t],
  );

  const sortedConversations = useMemo(() => {
    const getActivityTimestamp = (conv: (typeof conversations)[number]) =>
      conv.messages[conv.messages.length - 1]?.createdAt ?? conv.createdAt;

    return [...conversations].sort(
      (a, b) => getActivityTimestamp(b) - getActivityTimestamp(a),
    );
  }, [conversations]);

  const visibleConversations = useMemo(() => {
    const query = chatQuery.trim().toLowerCase();
    if (!query) return sortedConversations;

    return sortedConversations.filter((conv) => {
      const title = (conv.title || t("navigation.untitledChat")).toLowerCase();
      const latestMessage = conv.messages[conv.messages.length - 1];
      const latestText =
        latestMessage?.role === "assistant"
          ? (latestMessage.runs?.[0]?.text ?? latestMessage.content)
          : (latestMessage?.content ?? "");
      return (
        title.includes(query) || latestText.toLowerCase().includes(query)
      );
    });
  }, [chatQuery, sortedConversations, t]);

  const groupedConversations = useMemo(() => {
    const groups = {
      today: [] as typeof visibleConversations,
      yesterday: [] as typeof visibleConversations,
      week: [] as typeof visibleConversations,
      older: [] as typeof visibleConversations,
    };
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    visibleConversations.forEach((conv) => {
      const ts = conv.messages[conv.messages.length - 1]?.createdAt ?? conv.createdAt;
      const startOfTs = new Date(ts);
      const tsDay = new Date(
        startOfTs.getFullYear(),
        startOfTs.getMonth(),
        startOfTs.getDate(),
      ).getTime();
      const daysAgo = Math.floor((startOfToday - tsDay) / dayMs);

      if (daysAgo <= 0) {
        groups.today.push(conv);
      } else if (daysAgo === 1) {
        groups.yesterday.push(conv);
      } else if (daysAgo <= 7) {
        groups.week.push(conv);
      } else {
        groups.older.push(conv);
      }
    });

    return [
      { key: "today", label: t("navigation.today"), items: groups.today },
      {
        key: "yesterday",
        label: t("navigation.yesterday"),
        items: groups.yesterday,
      },
      { key: "week", label: t("navigation.last7Days"), items: groups.week },
      { key: "older", label: t("navigation.older"), items: groups.older },
    ].filter((group) => group.items.length > 0);
  }, [t, visibleConversations]);
  const activePlan = getPlanById(currentPlanId);
  const includedTotal = getIncludedCredits(activePlan, currency);
  const creditsRemaining = includedCreditsRemaining + topUpCreditsBalance;
  const remainingPercent =
    includedTotal > 0 ? (includedCreditsRemaining / includedTotal) * 100 : 0;
  const isDark = resolvedTheme === "dark";
  const hasResolvedTheme = Boolean(resolvedTheme);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col border-r bg-card/70 px-3 py-4 backdrop-blur transition-all duration-200",
        collapsed ? "w-16" : "w-72",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-2 shrink-0",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link
            href="/"
            className="text-sm font-semibold text-foreground transition hover:text-foreground/80"
          >
            {t("common.appName")}
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("accessibility.collapseSidebar")}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 space-y-3 shrink-0">
        <Button
          onClick={handleNewChat}
          className={cn(
            "w-full gap-2",
            collapsed ? "justify-center px-0" : "justify-start",
          )}
          variant="secondary"
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span>{t("navigation.newChat")}</span>}
        </Button>

        <div
          className={cn(
            "grid gap-2",
            collapsed ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={cn(
                    "flex items-center rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-wide transition",
                    collapsed ? "justify-center" : "gap-2",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                  {!collapsed && <span>{item.label}</span>}
                </span>
              </Link>
            );
          })}
        </div>

        {!collapsed && (
          <Link href="/account/billing">
            <div className="rounded-xl border bg-card/60 px-3 py-2 text-xs transition hover:bg-muted/40">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("navigation.plan")}</span>
                <Badge variant="secondary">{activePlan.name}</Badge>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("navigation.credits")}</span>
                  <span className="font-medium">
                    {formatCredits(creditsRemaining, currency, locale)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, remainingPercent)}%` }}
                  />
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        {!collapsed && (
          <div className="px-2 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("navigation.chats")}
              </p>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <Input
              value={chatQuery}
              onChange={(event) => setChatQuery(event.target.value)}
              placeholder={t("navigation.searchChats")}
              className="mt-2 h-8 text-xs"
            />
          </div>
        )}
        <ScrollArea className={cn("mt-2 flex-1 min-h-0")}>
          <div className="space-y-2 px-1">
            {visibleConversations.length === 0 && !collapsed && (
              <p className="px-2 text-xs text-muted-foreground">
                {chatQuery ? t("navigation.noMatchingChats") : t("navigation.noChatsYet")}
              </p>
            )}
            {collapsed
              ? visibleConversations.map((conv) => (
                  <Fragment key={conv.id}>
                    <ChatListItem
                      title={conv.title || t("navigation.untitledChat")}
                      active={conv.id === currentConversationId}
                      collapsed={collapsed}
                      onSelect={() => {
                        setCurrentConversation(conv.id);
                        router.push("/");
                        onNavigate?.();
                      }}
                      onRename={() => {
                        const currentTitle = conv.title || t("navigation.untitledChat");
                        setPendingRename({
                          id: conv.id,
                          title: currentTitle,
                        });
                        setRenameDraft(currentTitle);
                      }}
                      onDelete={() =>
                        setPendingDelete({
                          id: conv.id,
                          title: conv.title || t("navigation.untitledChat"),
                        })
                      }
                    />
                  </Fragment>
                ))
              : groupedConversations.map((group) => (
                  <div key={group.key} className="space-y-1">
                    <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((conv) => (
                      <Fragment key={conv.id}>
                        <ChatListItem
                          title={conv.title || t("navigation.untitledChat")}
                          active={conv.id === currentConversationId}
                          collapsed={collapsed}
                          onSelect={() => {
                            setCurrentConversation(conv.id);
                            router.push("/");
                            onNavigate?.();
                          }}
                          onRename={() => {
                            const currentTitle = conv.title || t("navigation.untitledChat");
                            setPendingRename({
                              id: conv.id,
                              title: currentTitle,
                            });
                            setRenameDraft(currentTitle);
                          }}
                          onDelete={() =>
                            setPendingDelete({
                              id: conv.id,
                              title: conv.title || t("navigation.untitledChat"),
                            })
                          }
                        />
                      </Fragment>
                    ))}
                  </div>
                ))}
          </div>
        </ScrollArea>
      </div>

      <div className="mt-4 space-y-3 px-1 pb-2 shrink-0">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2">
            {hasResolvedTheme ? (
              isDark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )
            ) : (
              <div className="h-4 w-4 rounded-full bg-muted/40" />
            )}
            {!collapsed && <span className="text-sm font-medium">{t("navigation.theme")}</span>}
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => {
              const nextTheme = checked ? "dark" : "light";
              setTheme(nextTheme);
              setAppTheme(nextTheme);
            }}
            aria-label={t("accessibility.toggleDarkMode")}
            disabled={!hasResolvedTheme}
          />
        </div>
        {!collapsed && <UserMenu key={pathname} />}
      </div>

      <Dialog
        open={Boolean(pendingRename)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRename(null);
            setRenameDraft("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogs.renameChatTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.renameChatDescription")}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            autoFocus
            placeholder={t("dialogs.renameChatPlaceholder")}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const nextTitle = renameDraft.trim();
              if (!nextTitle || !pendingRename) return;
              updateConversationTitle(pendingRename.id, nextTitle);
              setPendingRename(null);
              setRenameDraft("");
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingRename(null);
                setRenameDraft("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const nextTitle = renameDraft.trim();
                if (!nextTitle || !pendingRename) return;
                updateConversationTitle(pendingRename.id, nextTitle);
                setPendingRename(null);
                setRenameDraft("");
              }}
              disabled={!renameDraft.trim()}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogs.deleteChatTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialogs.deleteChatDescription", {
                title: pendingDelete?.title ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                removeConversation(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function ChatListItem({
  title,
  active,
  collapsed,
  onSelect,
  onRename,
  onDelete,
}: {
  title: string;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const shortLabel = (title.trim().charAt(0) || "•").toUpperCase();

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg px-1",
        collapsed && "justify-center",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={title}
        aria-label={title}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-muted/60",
          collapsed && "justify-center px-2",
        )}
      >
        {!collapsed ? (
          <span className="line-clamp-1 flex-1">{title}</span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold">
            {shortLabel}
          </span>
        )}
      </button>

      {!collapsed && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted/60 group-hover:opacity-100",
                active && "opacity-100",
              )}
              aria-label={t("navigation.openChatMenuFor", { title })}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <ChatMenuItem
              icon={Pencil}
              label={t("common.rename")}
              onClick={() => {
                setOpen(false);
                onRename();
              }}
            />
            <div className="my-1 h-px bg-border" />
            <ChatMenuItem
              icon={Trash2}
              label={t("common.delete")}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              destructive
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function ChatMenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted/60",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
