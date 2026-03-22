"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Fragment,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeftRight,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { UserMenu } from "@/components/UserMenu";
import { useI18n } from "@/lib/i18n";
import { useChatStore } from "@/lib/store";
import { useAppSettingsStore } from "@/lib/state/settingsStore";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const getConversationActivityTimestamp = useCallback(
    (conv: (typeof conversations)[number]) =>
      conv.messages[conv.messages.length - 1]?.createdAt ?? conv.createdAt,
    [],
  );

  const handleNewChat = useCallback(() => {
    const id = createConversation(t("navigation.untitledChat"));
    setCurrentConversation(id);
    router.push(`/chat/${id}`);
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

  const applyChatSearch = useCallback(
    (items: (typeof conversations)[number][]) => {
      const query = chatQuery.trim().toLowerCase();
      if (!query) return items;
      return items.filter((conv) => {
        const title = (
          conv.title || t("navigation.untitledChat")
        ).toLowerCase();
        const latestMessage = conv.messages[conv.messages.length - 1];
        const latestText =
          latestMessage?.role === "assistant"
            ? (latestMessage.runs?.[0]?.text ?? latestMessage.content)
            : (latestMessage?.content ?? "");
        return (
          title.includes(query) || latestText.toLowerCase().includes(query)
        );
      });
    },
    [chatQuery, t],
  );

  const groupConversationsByDate = useCallback(
    (items: (typeof conversations)[number][]) => {
      const groups = {
        today: [] as typeof conversations,
        yesterday: [] as typeof conversations,
        week: [] as typeof conversations,
        month: [] as typeof conversations,
        older: [] as typeof conversations,
      };
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      items.forEach((conv) => {
        const ts = getConversationActivityTimestamp(conv);
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
        } else if (daysAgo <= 30) {
          groups.month.push(conv);
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
        { key: "month", label: "Previous 30 Days", items: groups.month },
        { key: "older", label: t("navigation.older"), items: groups.older },
      ].filter((group) => group.items.length > 0);
    },
    [getConversationActivityTimestamp, t],
  );

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          getConversationActivityTimestamp(b) -
          getConversationActivityTimestamp(a),
      ),
    [conversations, getConversationActivityTimestamp],
  );

  const filteredConversations = useMemo(
    () => applyChatSearch(sortedConversations),
    [applyChatSearch, sortedConversations],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [groupConversationsByDate, filteredConversations],
  );

  const isDark = isClient && resolvedTheme === "dark";
  const hasResolvedTheme = isClient && Boolean(resolvedTheme);

  return (
    <aside
      className={cn(
        "surface-enter flex h-full min-h-0 shrink-0 flex-col rounded-[1.35rem] bg-card/82 px-3 py-3 shadow-[0_22px_54px_-34px_hsl(var(--foreground)/0.55)] backdrop-blur-xl transition-[width] duration-300",
        collapsed ? "w-[4.5rem]" : "w-[18rem]",
      )}
    >
      {/* Header: Logo + New Chat + Collapse */}
      <div
        className={cn(
          "shrink-0 rounded-xl px-2 py-1.5",
          "flex items-center gap-2",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link
            href="/chat"
            onClick={() => onNavigate?.()}
            className="text-[0.86rem] font-semibold tracking-tight text-foreground transition hover:text-foreground/80"
          >
            {t("common.appName")}
          </Link>
        )}
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <Button
            onClick={handleNewChat}
            size="icon"
            className="h-8 w-8 rounded-lg bg-primary/95 text-primary-foreground hover:bg-primary"
            aria-label={t("navigation.newChat")}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("accessibility.collapseSidebar")}
            onClick={() => setCollapsed((v) => !v)}
            className="h-8 w-8 rounded-lg"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="mt-3 shrink-0 px-1">
          <Input
            value={chatQuery}
            onChange={(event) => setChatQuery(event.target.value)}
            placeholder={t("navigation.searchChats")}
            className="h-8 border-border/70 bg-background/80 text-xs"
          />
        </div>
      )}

      {/* Chat list */}
      <ScrollArea className="mt-3 flex-1 min-h-0">
        <div className="space-y-1 px-1">
          {filteredConversations.length === 0 && !collapsed && (
            <p className="px-2 text-xs text-muted-foreground">
              {chatQuery
                ? t("navigation.noMatchingChats")
                : t("navigation.noChatsYet")}
            </p>
          )}

          {collapsed
            ? filteredConversations.map((conv) => (
                <Fragment key={conv.id}>
                  <ChatListItem
                    title={conv.title || t("navigation.untitledChat")}
                    active={conv.id === currentConversationId}
                    collapsed={collapsed}
                    onSelect={() => {
                      setCurrentConversation(conv.id);
                      router.push(`/chat/${conv.id}`);
                      onNavigate?.();
                    }}
                    onRename={() => {
                      const currentTitle =
                        conv.title || t("navigation.untitledChat");
                      setPendingRename({ id: conv.id, title: currentTitle });
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
                <div key={group.key} className="space-y-0.5">
                  <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                          router.push(`/chat/${conv.id}`);
                          onNavigate?.();
                        }}
                        onRename={() => {
                          const currentTitle =
                            conv.title || t("navigation.untitledChat");
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

      {/* Footer: theme toggle + user menu */}
      <div className="mt-4 space-y-2 px-1 pb-2 shrink-0">
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background/72 px-3 py-2">
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
            {!collapsed && (
              <span className="text-sm font-medium">
                {t("navigation.theme")}
              </span>
            )}
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

      {/* Rename dialog */}
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
            <DialogDescription>
              {t("dialogs.renameChatDescription")}
            </DialogDescription>
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

      {/* Delete dialog */}
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
                const deletingCurrent =
                  pendingDelete.id === currentConversationId;
                removeConversation(pendingDelete.id);
                setPendingDelete(null);
                if (deletingCurrent) {
                  router.push("/chat");
                }
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
        "group flex items-center gap-2 rounded-xl px-1",
        collapsed && "justify-center",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={title}
        aria-label={title}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-all",
          active
            ? "bg-primary/12 text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted/45 hover:text-foreground",
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
                "mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-muted/60 group-hover:opacity-100",
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
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted/60",
        destructive && "text-destructive hover:bg-destructive/10",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
