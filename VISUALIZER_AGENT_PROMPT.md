# Interactive In-Chat Visualizer — Implementation Prompt

You are implementing the interactive in-chat visualization feature for a Next.js 16 multi-model AI chat application. This is the single most important differentiating feature — it lets AI responses contain interactive HTML (charts, tabs, clickable cards, diagrams) rendered directly in the chat, similar to Claude.ai's artifacts system.

## What This Feature Does

When a user asks for something visual (e.g., "create me an interview prep guide, visualized"), the AI model outputs self-contained HTML wrapped in a special fenced code block. The frontend detects this block and renders it as an interactive iframe inline in the chat — not as raw code, but as a live, clickable, styled widget embedded in the conversation.

This works with ANY model (GPT-4o, Claude, Gemini, DeepSeek, etc.) because we instruct every model via system prompt to output HTML when visualization is requested.

---

## Architecture Overview

There are exactly 3 things to build:

1. **System Prompt Injection** — Tell every AI model to output `interactive-html` blocks when visualization is requested
2. **InteractiveBlock Component** — A React component that renders HTML in a sandboxed iframe
3. **MessageItem Integration** — Wire InteractiveBlock into the existing message rendering pipeline

---

## STEP 1: System Prompt Injection

### File: `app/api/chat/route.ts`

**Current state:** The route passes `messages` directly to `streamCompletion()` at line ~476 without any system prompt. Messages come from the client as-is.

**What to do:** Before passing messages to `streamCompletion()`, prepend a system message to the messages array. This system message instructs the model to generate interactive HTML when appropriate.

**Find this code block (around line 474):**

```typescript
const streamOptions: StreamOptions = {
  model: resolvedModelId,
  messages,
  temperature,
  maxTokens,
  signal: request.signal,
};
```

**Replace with:**

```typescript
// Build messages array with system prompt for interactive visualization
const systemMessage: ChatMessage = {
  role: "system",
  content: VISUALIZATION_SYSTEM_PROMPT,
};

const messagesWithSystem = [systemMessage, ...messages];

const streamOptions: StreamOptions = {
  model: resolvedModelId,
  messages: messagesWithSystem,
  temperature,
  maxTokens,
  signal: request.signal,
};
```

**Add this constant near the top of the file (after imports):**

```typescript
const VISUALIZATION_SYSTEM_PROMPT = `You are a helpful AI assistant. You have a special capability: when the user asks for something visual, interactive, structured, or uses words like "visualize", "visualized", "visual", "interactive", "diagram", "chart", or "dashboard", you MUST output an interactive HTML artifact.

To create an interactive artifact, wrap your HTML in a fenced code block with the language tag \`interactive-html\`:

\`\`\`interactive-html
<!DOCTYPE html>
<html>
<head><style>/* your CSS here */</style></head>
<body>
  <!-- your interactive HTML here -->
  <script>/* your JS here */</script>
</body>
</html>
\`\`\`

Rules for interactive-html blocks:
1. The HTML MUST be fully self-contained — all CSS inline in <style> tags, all JS inline in <script> tags.
2. You may use CDN links ONLY for: Chart.js (https://cdn.jsdelivr.net/npm/chart.js), Mermaid (https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js), or KaTeX.
3. Make it genuinely interactive: use clickable tabs, accordions, expandable sections, hover tooltips, progress bars, sortable tables, animated transitions.
4. Use a professional dark theme by default: dark backgrounds (#1a1a2e, #16213e, #0f3460), light text (#e0e0e0), accent colors for highlights.
5. Make it responsive — it will be displayed in an iframe that can be various widths.
6. NEVER use alert(), confirm(), or prompt() dialogs.
7. You can mix regular markdown text BEFORE and AFTER the interactive-html block. Use text to explain, and the interactive block to visualize.
8. If the user's request is simple and doesn't need visualization, just respond with normal text. Don't force interactive blocks when plain text is better.
9. Keep the HTML concise but functional — aim for under 500 lines of HTML.`;
```

**Important:** Make sure the `ChatMessage` type import is available. Check `lib/api/types.ts` — the type should already be defined there with `role: "system" | "user" | "assistant"`.

### Provider-specific note:

The Anthropic adapter (`lib/api/anthropic.ts`) already handles system messages specially — it extracts messages with `role === "system"` and passes them as the `system` parameter in the API call (lines 59-74). The OpenAI and Google adapters pass system messages as-is. So this approach works across all providers without changes to the adapters.

---

## STEP 2: InteractiveBlock Component

### Create new file: `components/chat/InteractiveBlock.tsx`

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Maximize2, Code2, Copy, Check, X } from "lucide-react";

interface InteractiveBlockProps {
  html: string;
  /** Optional: make the block shorter in compare mode */
  compact?: boolean;
}

/**
 * Renders self-contained HTML in a sandboxed iframe inline in the chat.
 * Handles auto-resizing, fullscreen expansion, and code view toggle.
 */
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

  // Inject a resize observer script into the HTML so the iframe can
  // communicate its content height to the parent via postMessage.
  const htmlWithResizeScript = `
    ${html}
    <script>
      (function() {
        function postHeight() {
          const h = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
          );
          window.parent.postMessage({ type: 'interactive-block-resize', height: h }, '*');
        }
        // Post height on load and after any DOM mutations
        window.addEventListener('load', postHeight);
        window.addEventListener('resize', postHeight);
        new MutationObserver(postHeight).observe(document.body, {
          childList: true, subtree: true, attributes: true
        });
        // Also post after a short delay for async content (charts, etc.)
        setTimeout(postHeight, 100);
        setTimeout(postHeight, 500);
        setTimeout(postHeight, 1500);
      })();
    </script>
  `;

  // Listen for resize messages from the iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "interactive-block-resize" &&
        typeof event.data.height === "number"
      ) {
        // Only resize if the message came from our iframe
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

  // Handle iframe load errors
  const handleIframeError = useCallback(() => {
    setRenderError(true);
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Fullscreen modal
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-6xl h-[90vh] rounded-xl overflow-hidden border border-white/10 bg-background shadow-2xl">
          {/* Toolbar */}
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
          {/* Content */}
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

  // Error fallback
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

  // Inline view
  return (
    <div ref={containerRef} className="my-3 group relative">
      {/* Toolbar */}
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

      {/* Content */}
      {showCode ? (
        <pre className="overflow-auto rounded-xl border border-white/10 bg-muted/20 p-3 text-xs font-mono text-foreground/80 max-h-[400px]">
          <code>{html}</code>
        </pre>
      ) : (
        <iframe
          ref={iframeRef}
          srcDoc={htmlWithResizeScript}
          sandbox="allow-scripts allow-popups"
          className="w-full border-0 rounded-xl border border-white/[0.06] bg-transparent"
          style={{ height: `${height}px` }}
          title="Interactive visualization"
          onError={handleIframeError}
        />
      )}
    </div>
  );
}
```

---

## STEP 3: Wire InteractiveBlock into MessageItem

### File: `components/chat/MessageItem.tsx`

The message content is currently rendered by `ReactMarkdown` at approximately lines 200-235. We need to intercept the content BEFORE ReactMarkdown, split it into text segments and interactive-html segments, and render each appropriately.

**3a. Add import at the top of MessageItem.tsx:**

```typescript
import InteractiveBlock from "./InteractiveBlock";
```

**3b. Add this helper function** inside the file (before the component, or in a utils file):

````typescript
/**
 * Splits a message string into segments of plain text and interactive-html blocks.
 * Returns an array of { type: 'text' | 'interactive', content: string } objects.
 */
function splitInteractiveBlocks(
  content: string,
): Array<{ type: "text" | "interactive"; content: string }> {
  const segments: Array<{ type: "text" | "interactive"; content: string }> = [];
  // Match ```interactive-html ... ``` blocks (with optional whitespace)
  const regex = /```interactive-html\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Text before this block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", content: text });
    }
    // The interactive block
    segments.push({ type: "interactive", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last block
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) segments.push({ type: "text", content: text });
  }

  // If no interactive blocks found, return single text segment
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "text", content: content.trim() });
  }

  return segments;
}
````

**3c. Replace the ReactMarkdown rendering block.** Find the section (approximately lines 199-236) that looks like:

```tsx
) : (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    components={{
      p: ({ children }) => (
        <p className="mb-2 last:mb-0">{children}</p>
      ),
      code: ({ className, children, ...props }) => {
        const isInline = !className;
        if (isInline) {
          return (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono" {...props}>
              {children}
            </code>
          );
        }
        const language = className?.replace("language-", "") ?? "text";
        const code = String(children).replace(/\n$/, "");
        return <CodeBlock code={code} language={language} />;
      },
      pre: ({ children }) => <>{children}</>,
    }}
  >
    {displayContent || ...}
  </ReactMarkdown>
)}
```

**Replace with:**

```tsx
) : (
  <>
    {splitInteractiveBlocks(
      displayContent ||
        (selectedRun?.status === "queued"
          ? t("chat.waitingForSlot")
          : selectedRun?.status === "streaming"
            ? t("chat.thinking")
            : "")
    ).map((segment, i) =>
      segment.type === "interactive" ? (
        <InteractiveBlock key={i} html={segment.content} />
      ) : (
        <ReactMarkdown
          key={i}
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            p: ({ children }) => (
              <p className="mb-2 last:mb-0">{children}</p>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              const language =
                className?.replace("language-", "") ?? "text";
              const code = String(children).replace(/\n$/, "");
              return <CodeBlock code={code} language={language} />;
            },
            pre: ({ children }) => <>{children}</>,
          }}
        >
          {segment.content}
        </ReactMarkdown>
      )
    )}
  </>
)}
```

---

## STEP 4: Wire InteractiveBlock into UnifiedAnswerFlow (Compare Mode)

### File: `components/chat/UnifiedAnswerFlow.tsx`

This component renders multi-model comparison responses. It also uses ReactMarkdown to render each model's output. Apply the same pattern:

**4a. Import InteractiveBlock and the splitInteractiveBlocks function:**

```typescript
import InteractiveBlock from "./InteractiveBlock";
```

Copy or import the `splitInteractiveBlocks` function. If you want to avoid duplication, extract it to a shared utility:

**Create file: `lib/utils/interactiveBlocks.ts`**

```typescript
export function splitInteractiveBlocks(
  content: string,
): Array<{ type: "text" | "interactive"; content: string }> {
  // (same implementation as above)
}
```

Then import it in both MessageItem.tsx and UnifiedAnswerFlow.tsx.

**4b. In UnifiedAnswerFlow.tsx**, find wherever ReactMarkdown renders model response text and apply the same split pattern. Each model's response in compare mode should render interactive blocks with the `compact` prop:

```tsx
<InteractiveBlock html={segment.content} compact />
```

This makes compare mode show slightly shorter iframes so multiple models' visualizations fit side by side.

---

## STEP 5: Handle Mermaid and LaTeX (Bonus Auto-Detection)

In addition to explicit `interactive-html` blocks, detect and auto-render these common code block types:

### In the `splitInteractiveBlocks` function, extend the regex to also catch mermaid blocks:

````typescript
// Also detect ```mermaid blocks and convert them to interactive-html
const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;

// Before the main regex pass, convert mermaid blocks to interactive-html blocks:
content = content.replace(mermaidRegex, (_, mermaidCode) => {
  return (
    "```interactive-html\n" +
    "<!DOCTYPE html><html><head>" +
    '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>' +
    "<style>body{background:#1a1a2e;display:flex;justify-content:center;padding:20px;margin:0}" +
    ".mermaid{color:#e0e0e0}</style>" +
    '</head><body><div class="mermaid">' +
    mermaidCode +
    "</div>" +
    '<script>mermaid.initialize({theme:"dark",startOnLoad:true});</script>' +
    "</body></html>\n```"
  );
});
````

### For LaTeX math expressions:

Install KaTeX if not already present:

```bash
npm install katex
```

In the ReactMarkdown components config, add a math renderer using remark-math and rehype-katex, or handle `$...$` expressions in a custom component. This is lower priority than the interactive-html feature — implement it as a fast-follow if time permits.

---

## STEP 6: Performance — Lazy Load Iframes

Interactive blocks with iframes are heavier than text. Add lazy loading so off-screen iframes don't load until scrolled into view.

**In InteractiveBlock.tsx**, add an IntersectionObserver:

```tsx
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  if (!containerRef.current) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    },
    { rootMargin: "200px" }, // Start loading 200px before visible
  );
  observer.observe(containerRef.current);
  return () => observer.disconnect();
}, []);
```

Then conditionally render the iframe:

```tsx
{isVisible ? (
  <iframe ... />
) : (
  <div style={{ height: `${height}px` }} className="rounded-xl border border-white/[0.06] bg-muted/10 animate-pulse" />
)}
```

---

## Verification Checklist

After implementing all steps, verify the following:

1. **Build compiles:** Run `npm run build` — zero TypeScript errors
2. **System prompt works:** Open the app, send "create me an interview prep guide. Visualized" — the model should respond with an `interactive-html` fenced code block
3. **InteractiveBlock renders:** The `interactive-html` block should appear as a live, interactive iframe in the chat — NOT as raw code
4. **Toolbar works:** Hover over the interactive block — Expand, Code, and Copy buttons should appear
5. **Fullscreen works:** Click Expand — the visualization should open in a centered modal overlay
6. **Code toggle works:** Click Code — should show the raw HTML source instead of the iframe
7. **Copy works:** Click Copy — the HTML should be copied to clipboard
8. **Auto-resize works:** The iframe should adjust its height to fit the content (no excessive whitespace or cut-off content)
9. **Error fallback works:** If you manually feed a broken HTML string, it should show "Visualization couldn't render" with the raw code
10. **Compare mode works:** In compare mode with multiple models, each model's interactive block should render independently
11. **Regular messages unaffected:** Send a normal text prompt (e.g., "what is 2+2") — it should render as normal markdown text, no iframe
12. **Mermaid works:** Send "draw a flowchart of a login process using mermaid" — should render as a visual diagram
13. **Performance:** Scroll through a conversation with multiple interactive blocks — no lag or jank (lazy loading should prevent unnecessary renders)

---

## Files Modified/Created Summary

| Action   | File                                                                                         |
| -------- | -------------------------------------------------------------------------------------------- |
| MODIFIED | `app/api/chat/route.ts` — Add VISUALIZATION_SYSTEM_PROMPT and inject as system message       |
| CREATED  | `components/chat/InteractiveBlock.tsx` — Iframe renderer with toolbar                        |
| CREATED  | `lib/utils/interactiveBlocks.ts` — splitInteractiveBlocks utility                            |
| MODIFIED | `components/chat/MessageItem.tsx` — Import and use InteractiveBlock + splitInteractiveBlocks |
| MODIFIED | `components/chat/UnifiedAnswerFlow.tsx` — Same integration for compare mode                  |

**Do NOT modify:**

- Provider adapters (they already handle system messages correctly)
- Billing/billing logic
- Sidebar, Composer, or other UI components
- Database schema

**Dependencies to install (if not already present):**

- None required for the core feature. Mermaid and Chart.js load from CDN inside the iframe.
- Optional: `katex` for LaTeX rendering (lower priority)
