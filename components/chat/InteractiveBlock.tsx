"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Maximize2, Code2, Copy, Check, X } from "lucide-react";

interface InteractiveBlockProps {
  html: string;
  compact?: boolean;
}

export default function InteractiveBlock({
  html,
  compact,
}: InteractiveBlockProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(compact ? 300 : 400);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

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

  // Lazy loading via IntersectionObserver
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

  const handleIframeError = useCallback(() => {
    setRenderError(true);
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-6xl h-[90vh] rounded-xl overflow-hidden border border-white/10 bg-background shadow-2xl">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Interactive
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCode(!showCode)}
                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition"
                title={showCode ? "Show preview" : "Show code"}
              >
                <Code2 className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition"
                title="Copy HTML"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => setFullscreen(false)}
                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition"
                title="Close fullscreen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {showCode ? (
            <pre className="h-full overflow-auto p-4 text-xs font-mono text-foreground/80 bg-muted/20">
              <code>{html}</code>
            </pre>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={htmlWithResizeScript}
              sandbox="allow-scripts allow-popups"
              className="w-full h-full border-0 bg-transparent"
              title="Interactive visualization (fullscreen)"
              onError={handleIframeError}
            />
          )}
        </div>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="my-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
        <p className="text-xs text-yellow-400 mb-2 font-medium">
          Visualization couldn&apos;t render — showing code instead
        </p>
        <pre className="overflow-auto rounded-lg bg-muted/20 p-3 text-xs font-mono text-foreground/80 max-h-[400px]">
          <code>{html}</code>
        </pre>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="my-3 group relative">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground/70 flex items-center gap-1.5 uppercase tracking-wider">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Interactive
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setFullscreen(true)}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground transition"
            title="Expand fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowCode(!showCode)}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground transition"
            title={showCode ? "Show preview" : "Show code"}
          >
            <Code2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground transition"
            title="Copy HTML"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {showCode ? (
        <pre className="overflow-auto rounded-xl border border-white/10 bg-muted/20 p-3 text-xs font-mono text-foreground/80 max-h-[400px]">
          <code>{html}</code>
        </pre>
      ) : isVisible ? (
        <iframe
          ref={iframeRef}
          srcDoc={htmlWithResizeScript}
          sandbox="allow-scripts allow-popups"
          className="w-full border-0 rounded-xl border border-white/[0.06] bg-transparent"
          style={{ height: `${height}px` }}
          title="Interactive visualization"
          onError={handleIframeError}
        />
      ) : (
        <div
          style={{ height: `${height}px` }}
          className="rounded-xl border border-white/[0.06] bg-muted/10 animate-pulse"
        />
      )}
    </div>
  );
}
