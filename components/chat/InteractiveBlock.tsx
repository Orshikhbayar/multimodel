"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Maximize2, Code2, Copy, Check, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface InteractiveBlockProps {
  html: string;
  /** Optional: make the block shorter in compare mode */
  compact?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Renders self-contained HTML in a sandboxed iframe inline in the chat.
 * Handles auto-resizing, fullscreen expansion, and code view toggle.
 *
 * The inline and fullscreen views share ONE element tree (classes swap),
 * so entering/leaving fullscreen or toggling the code view never remounts
 * the iframe — the visualization keeps its internal state.
 */
export default function InteractiveBlock({
  html,
  compact,
}: InteractiveBlockProps) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [height, setHeight] = useState(compact ? 300 : 400);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Inject a resize observer script into the HTML so the iframe can
  // communicate its content height to the parent via postMessage.
  const htmlWithResizeScript = `
    ${html}
    <script>
      (function() {
        function postHeight() {
          var h = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
          );
          window.parent.postMessage({ type: 'interactive-block-resize', height: h }, '*');
        }
        window.addEventListener('load', postHeight);
        window.addEventListener('resize', postHeight);
        new MutationObserver(postHeight).observe(document.body, {
          childList: true, subtree: true, attributes: true
        });
        setTimeout(postHeight, 100);
        setTimeout(postHeight, 500);
        setTimeout(postHeight, 1500);
      })();
    </script>
  `;

  // Lazy load: only render iframe when scrolled into view
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Listen for resize messages from the iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "interactive-block-resize" &&
        typeof event.data.height === "number"
      ) {
        if (
          iframeRef.current &&
          event.source === iframeRef.current.contentWindow
        ) {
          const newHeight = Math.min(
            Math.max(event.data.height + 20, 200),
            2000,
          );
          setHeight(newHeight);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Fullscreen dialog behavior: Escape closes, Tab is trapped, the page
  // behind doesn't scroll, and focus returns to the trigger on exit.
  useEffect(() => {
    if (!fullscreen) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFullscreen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeydown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [fullscreen]);

  // Clear the copied-feedback timer on unmount
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handleIframeError = useCallback(() => {
    setRenderError(true);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — ignore
    }
  };

  // Error fallback
  if (renderError) {
    return (
      <div className="my-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
        <p className="text-xs text-yellow-400 mb-2 font-medium">
          {t("chat.vizRenderError")}
        </p>
        <pre className="overflow-auto rounded-lg bg-muted/20 p-3 text-xs font-mono text-foreground/80 max-h-[400px]">
          <code>{html}</code>
        </pre>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn(!fullscreen && "my-3 group relative")}>
      <div
        className={cn(
          fullscreen &&
            "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4",
        )}
      >
        <div
          ref={dialogRef}
          role={fullscreen ? "dialog" : undefined}
          aria-modal={fullscreen || undefined}
          aria-label={fullscreen ? t("chat.interactiveViz") : undefined}
          tabIndex={fullscreen ? -1 : undefined}
          className={cn(
            fullscreen &&
              "relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-background shadow-2xl outline-none",
          )}
        >
          {/* Toolbar */}
          <div
            className={cn(
              "flex items-center justify-between",
              fullscreen
                ? "border-b border-white/10 bg-muted/30 px-4 py-2"
                : "mb-1.5",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1.5 font-medium text-muted-foreground",
                fullscreen
                  ? "text-xs"
                  : "text-[10px] uppercase tracking-wider text-muted-foreground/70",
              )}
            >
              <span
                className={cn(
                  "inline-block rounded-full bg-emerald-400",
                  fullscreen ? "h-2 w-2 animate-pulse" : "h-1.5 w-1.5",
                )}
              />
              {t("chat.interactiveLabel")}
            </span>
            {/* Visible on hover AND on keyboard focus — opacity-0 with
                group-hover only made these buttons unreachable for
                keyboard users. */}
            <div
              className={cn(
                "flex items-center",
                fullscreen
                  ? "gap-1"
                  : "gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className={cn(
                  "rounded-md text-muted-foreground transition hover:bg-muted/50",
                  fullscreen ? "p-1.5" : "p-1 rounded",
                )}
                title={showCode ? t("chat.showPreview") : t("chat.showCode")}
                aria-label={
                  showCode ? t("chat.showPreview") : t("chat.showCode")
                }
                aria-pressed={showCode}
              >
                <Code2 className={fullscreen ? "h-4 w-4" : "h-3.5 w-3.5"} />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "rounded-md text-muted-foreground transition hover:bg-muted/50",
                  fullscreen ? "p-1.5" : "p-1 rounded",
                )}
                title={t("chat.copyHtml")}
                aria-label={t("chat.copyHtml")}
              >
                {copied ? (
                  <Check
                    className={cn(
                      "text-emerald-400",
                      fullscreen ? "h-4 w-4" : "h-3.5 w-3.5",
                    )}
                  />
                ) : (
                  <Copy className={fullscreen ? "h-4 w-4" : "h-3.5 w-3.5"} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(!fullscreen)}
                className={cn(
                  "rounded-md text-muted-foreground transition hover:bg-muted/50",
                  fullscreen ? "p-1.5" : "p-1 rounded",
                )}
                title={
                  fullscreen
                    ? t("chat.closeFullscreen")
                    : t("chat.expandFullscreen")
                }
                aria-label={
                  fullscreen
                    ? t("chat.closeFullscreen")
                    : t("chat.expandFullscreen")
                }
              >
                {fullscreen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Content. The iframe stays mounted while the code view is open
              (hidden, not unmounted) so widget state survives the toggle. */}
          <div className={cn(fullscreen && "min-h-0 flex-1")}>
            {showCode && (
              <pre
                className={cn(
                  "overflow-auto p-3 text-xs font-mono text-foreground/80",
                  fullscreen
                    ? "h-full bg-muted/20 p-4"
                    : "max-h-[400px] rounded-xl border border-white/10 bg-muted/20",
                )}
              >
                <code>{html}</code>
              </pre>
            )}
            {isVisible ? (
              <iframe
                ref={iframeRef}
                srcDoc={htmlWithResizeScript}
                sandbox="allow-scripts allow-popups"
                className={cn(
                  "w-full border-0 bg-transparent",
                  fullscreen ? "h-full" : "rounded-xl border border-white/[0.06]",
                  showCode && "hidden",
                )}
                style={fullscreen ? undefined : { height: `${height}px` }}
                title={t("chat.interactiveViz")}
                onError={handleIframeError}
              />
            ) : (
              !showCode && (
                <div
                  style={{ height: `${height}px` }}
                  className="animate-pulse rounded-xl border border-white/[0.06] bg-muted/10"
                />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
