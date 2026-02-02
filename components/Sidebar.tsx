"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import {
  ArrowLeftRight,
  CreditCard,
  FolderKanban,
  FolderPlus,
  Home,
  MessageSquare,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Star,
  Sun,
  Tag,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { UserMenu } from "@/components/UserMenu";
import { useBillingStore } from "@/lib/billing/store";
import { getPlanById } from "@/lib/billing/plans";
import { formatCredits, getIncludedCredits } from "@/lib/billing/utils";
import { useChatStore } from "@/lib/store";
import { useAppSettingsStore } from "@/lib/state/settingsStore";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const setAppTheme = useAppSettingsStore((state) => state.setTheme);
  const [collapsed, setCollapsed] = useState(false);
  const {
    conversations,
    currentConversationId,
    createConversation,
    setCurrentConversation,
    updateConversationTitle,
    removeConversation,
  } = useChatStore();
  const { currentPlanId, currency, includedCreditsRemaining, topUpCreditsBalance } =
    useBillingStore();

  const handleNewChat = useCallback(() => {
    const id = createConversation("Untitled chat");
    setCurrentConversation(id);
    router.push("/");
    onNavigate?.();
  }, [createConversation, setCurrentConversation, router, onNavigate]);

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
      { href: "/", label: "Chat", icon: Home },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/account?tab=billing", label: "Billing", icon: CreditCard },
      { href: "/pricing", label: "Pricing", icon: Tag },
    ],
    [],
  );

  const visibleConversations = conversations;
  const activePlan = getPlanById(currentPlanId);
  const includedTotal = getIncludedCredits(activePlan, currency);
  const creditsRemaining = includedCreditsRemaining + topUpCreditsBalance;
  const remainingPercent = includedTotal > 0 ? (includedCreditsRemaining / includedTotal) * 100 : 0;

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
            MultiModel
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collapse sidebar"
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
          {!collapsed && <span>New Chat</span>}
        </Button>

        <div className={cn("grid gap-2", collapsed ? "grid-cols-1" : "grid-cols-4")}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={cn(
                    "flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-wide transition",
                    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {!collapsed && <span className="sr-only">{item.label}</span>}
                </span>
              </Link>
            );
          })}
        </div>

        {!collapsed && (
          <Link href="/account?tab=billing">
            <div className="rounded-xl border bg-card/60 px-3 py-2 text-xs transition hover:bg-muted/40">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plan</span>
                <Badge variant="secondary">{activePlan.name}</Badge>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Credits</span>
                  <span className="font-medium">{formatCredits(creditsRemaining, currency)}</span>
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
              <p className="text-xs font-semibold text-muted-foreground">Chats</p>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        )}
        <ScrollArea className={cn("mt-2 flex-1 min-h-0")}>
          <div className="space-y-1 px-1">
            {visibleConversations.length === 0 && !collapsed && (
              <p className="px-2 text-xs text-muted-foreground">No chats yet.</p>
            )}
            {visibleConversations.map((conv) => (
              <Fragment key={conv.id}>
                <ChatListItem
                  title={conv.title || "Untitled chat"}
                  active={conv.id === currentConversationId}
                  collapsed={collapsed}
                  onSelect={() => {
                    setCurrentConversation(conv.id);
                    router.push("/");
                    onNavigate?.();
                  }}
                  onRename={() => {
                    const next = window.prompt("Rename chat", conv.title || "Untitled chat");
                    if (next && next.trim()) {
                      updateConversationTitle(conv.id, next.trim());
                    }
                  }}
                  onDelete={() => removeConversation(conv.id)}
                />
              </Fragment>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="mt-4 space-y-3 px-1 pb-2 shrink-0">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2">
            {resolvedTheme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            {!collapsed && <span className="text-sm font-medium">Theme</span>}
          </div>
          <Switch
            checked={resolvedTheme === "dark"}
            onCheckedChange={(checked) => {
              const nextTheme = checked ? "dark" : "light";
              setTheme(nextTheme);
              setAppTheme(nextTheme);
            }}
            aria-label="Toggle dark mode"
            disabled={!resolvedTheme}
          />
        </div>
        {!collapsed && (
          <UserMenu key={pathname} />
        )}
      </div>
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
  const [open, setOpen] = useState(false);

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
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted/60",
          collapsed && "justify-center px-2",
        )}
      >
        {!collapsed ? (
          <span className="line-clamp-1 flex-1">{title}</span>
        ) : (
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
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
              aria-label={`Open chat menu for ${title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <ChatMenuItem
              icon={Star}
              label="Star"
              onClick={() => {
                setOpen(false);
              }}
            />
            <ChatMenuItem
              icon={Pencil}
              label="Rename"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
            />
            <ChatMenuItem
              icon={FolderPlus}
              label="Add to project"
              onClick={() => {
                setOpen(false);
              }}
            />
            <div className="my-1 h-px bg-border" />
            <ChatMenuItem
              icon={Trash2}
              label="Delete"
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
