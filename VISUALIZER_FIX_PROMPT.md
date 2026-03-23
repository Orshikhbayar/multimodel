# Visualizer Fix — Models Not Outputting interactive-html Blocks

## Problem

The interactive visualization feature was implemented (InteractiveBlock component, splitInteractiveBlocks utility, system prompt injection, MessageItem/UnifiedAnswerFlow integration). The build compiles. But when users send prompts like "create me interview prep guide. Visualized", models (especially GPT-4o-mini) respond with plain Mongolian text instead of `interactive-html` code blocks.

## Root Cause

Two issues are causing this:

### Issue 1: Competing System Prompts

The client (`lib/hooks/useChatActions.ts`) sends its own system messages before the user message — specifically a Mongolian locale instruction: "Respond in Mongolian (Cyrillic) by default." The server then PREPENDS another system message (VISUALIZATION_SYSTEM_PROMPT). So the model receives:

1. System: VISUALIZATION_SYSTEM_PROMPT (long, 9 rules, ~300 words)
2. System: "Respond in Mongolian (Cyrillic) by default..." (from client)
3. User: "create me interview prep guide. Visualized"

Smaller models like GPT-4o-mini can't reliably follow two competing system instructions. They prioritize the shorter, simpler Mongolian instruction and ignore the complex visualization format rules.

### Issue 2: System Prompt is Too Passive for Small Models

The system prompt says "when the user asks for something visual... you MUST output an interactive HTML artifact." This works for powerful models (Claude Sonnet, GPT-4o) but GPT-4o-mini doesn't reliably follow long conditional instructions in system prompts. It needs explicit, immediate reinforcement in the user message itself.

## The Fix — Two Changes

### Fix 1: Shorten and strengthen the server-side system prompt

**File: `app/api/chat/route.ts`**

Replace the current `VISUALIZATION_SYSTEM_PROMPT` constant with a shorter, more assertive version:

```typescript
const VISUALIZATION_SYSTEM_PROMPT = `You are a helpful AI assistant with a special visualization capability.

When the user asks for anything visual or uses words like "visualize", "visualized", "visual", "interactive", "diagram", "chart", or "dashboard", you MUST respond with an interactive HTML artifact wrapped in a fenced code block tagged \`interactive-html\`.

Example format:
\`\`\`interactive-html
<!DOCTYPE html>
<html>
<head><style>body{margin:0;font-family:system-ui;background:#1a1a2e;color:#e0e0e0}</style></head>
<body><!-- interactive content --><script>/* interactivity */</script></body>
</html>
\`\`\`

Rules: Self-contained HTML only (inline CSS/JS). Use dark theme (#1a1a2e background). Make it interactive (tabs, accordions, hover effects). Allowed CDN: Chart.js, Mermaid. No alert/confirm/prompt. You may add markdown text before or after the block.`;
```

This is ~60% shorter than the original. Shorter system prompts are followed more reliably by smaller models.

### Fix 2: Add client-side visualization trigger detection

**File: `lib/hooks/useChatActions.ts`**

This is the critical fix. When the user's message contains visualization keywords, append an explicit instruction directly to the user message content before sending it to the API. This puts the instruction RIGHT NEXT TO the user's text, making it impossible for the model to miss.

**Step 2a: Create a helper function.** Add this near the top of the file or in a shared utility:

```typescript
/**
 * Detects if the user's message is requesting a visualization and returns
 * an augmented version of the message with explicit formatting instructions.
 * Returns the original message unchanged if no visualization is detected.
 */
function augmentWithVisualizationHint(userContent: string): string {
  const visualTriggers =
    /\b(visualiz|visual|interactive|diagram|chart|dashboard|infographic|flowchart|graph|timeline)\b/i;

  if (!visualTriggers.test(userContent)) {
    return userContent;
  }

  return `${userContent}

[FORMAT INSTRUCTION: Respond with an interactive HTML visualization. Wrap your HTML in a fenced code block with the language tag \`interactive-html\`. The HTML must be self-contained (inline CSS in <style>, inline JS in <script>). Use a dark theme (background: #1a1a2e, text: #e0e0e0). Make it interactive with tabs, clickable sections, hover effects, or expandable areas. You may include brief markdown text before or after the HTML block, but the main response MUST be the interactive-html block.]`;
}
```

**Step 2b: Apply the augmentation.** Find all places in `useChatActions.ts` where the user message content is added to the `apiMessages` array. There are multiple code paths (single mode and compare mode). In each one, apply the augmentation to the user content.

Look for lines like:

```typescript
apiMessages.push({ role: "user", content });
```

Replace with:

```typescript
apiMessages.push({
  role: "user",
  content: augmentWithVisualizationHint(content),
});
```

**IMPORTANT:** There are multiple places in useChatActions.ts where user messages are pushed. You need to find ALL of them. Based on the current code, these are approximately at:

- Around line 1264 (single/compare mode initial send)
- Around line 1419 (any other send paths)
- Do NOT augment the synthesis/unified answer call (~line 419) — that's the internal model-to-model call, not a user message

Search for all instances of `apiMessages.push({ role: "user"` and augment each one that contains the actual user content (not the synthesis prompt).

**Step 2c: Handle the Mongolian locale instruction conflict.** In the same file, find where the locale instruction is pushed as a system message:

```typescript
const localeInstruction = getLocaleResponseInstruction(locale);
if (localeInstruction) {
  apiMessages.push({ role: "system", content: localeInstruction });
}
```

Modify the locale instruction to be visualization-aware:

```typescript
const localeInstruction = getLocaleResponseInstruction(locale);
if (localeInstruction) {
  // Append visualization compatibility note to locale instruction
  const localeWithVizNote = `${localeInstruction} However, when outputting interactive-html code blocks, write the HTML, CSS, and JavaScript in English. Only the visible text content shown to the user should be in the user's language.`;
  apiMessages.push({ role: "system", content: localeWithVizNote });
}
```

This ensures the Mongolian instruction doesn't override the visualization format — it tells the model to use Mongolian for visible text but English for code.

### Fix 3: Make the regex more permissive in splitInteractiveBlocks

**File: `lib/utils/interactiveBlocks.ts`**

Some models might output slight variations of the code block tag. Make the regex more forgiving:

````typescript
export function splitInteractiveBlocks(
  content: string,
): Array<{ type: "text" | "interactive"; content: string }> {
  const segments: Array<{ type: "text" | "interactive"; content: string }> = [];

  // Convert ```mermaid blocks to interactive-html blocks
  content = content.replace(
    /```mermaid\s*\n([\s\S]*?)```/gi,
    (_, mermaidCode: string) => {
      return (
        "```interactive-html\n" +
        "<!DOCTYPE html><html><head>" +
        '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></' +
        "script>" +
        "<style>body{background:#1a1a2e;display:flex;justify-content:center;padding:20px;margin:0}" +
        ".mermaid{color:#e0e0e0}</style>" +
        '</head><body><div class="mermaid">' +
        mermaidCode +
        "</div>" +
        '<script>mermaid.initialize({theme:"dark",startOnLoad:true});</' +
        "script>" +
        "</body></html>\n```"
      );
    },
  );

  // Match ```interactive-html ... ``` blocks
  // Case-insensitive, allow optional whitespace, also match ```html if it contains
  // full HTML document structure (<!DOCTYPE or <html)
  const regex =
    /```(?:interactive-html|interactive[-_\s]?html)\s*\n([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", content: text });
    }
    segments.push({ type: "interactive", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  // FALLBACK: If no interactive-html blocks found, check for ```html blocks
  // that contain full HTML documents (<!DOCTYPE or <html). Some models output
  // ```html instead of ```interactive-html despite the instruction.
  if (segments.length === 0) {
    const htmlFallbackRegex = /```html\s*\n([\s\S]*?)```/gi;
    let htmlMatch;
    lastIndex = 0;

    while ((htmlMatch = htmlFallbackRegex.exec(content)) !== null) {
      const htmlContent = htmlMatch[1].trim();
      // Only treat as interactive if it looks like a full HTML document
      if (htmlContent.match(/<!doctype\s+html|<html|<head[\s>]|<body[\s>]/i)) {
        if (htmlMatch.index > lastIndex) {
          const text = content.slice(lastIndex, htmlMatch.index).trim();
          if (text) segments.push({ type: "text", content: text });
        }
        segments.push({ type: "interactive", content: htmlContent });
        lastIndex = htmlMatch.index + htmlMatch[0].length;
      }
    }

    // Remaining text after fallback matches
    if (lastIndex > 0 && lastIndex < content.length) {
      const text = content.slice(lastIndex).trim();
      if (text) segments.push({ type: "text", content: text });
    }
  } else {
    // Remaining text after primary matches
    if (lastIndex < content.length) {
      const text = content.slice(lastIndex).trim();
      if (text) segments.push({ type: "text", content: text });
    }
  }

  // If still nothing found, return as plain text
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "text", content: content.trim() });
  }

  return segments;
}
````

Key changes:

- Case-insensitive regex matching (`/gi`)
- Matches variations: `interactive-html`, `interactive_html`, `interactive html`
- **Critical fallback**: If no `interactive-html` blocks found, scans for `\`\`\`html` blocks that contain full HTML documents (`<!DOCTYPE`, `<html>`, `<head>`, `<body>`) and treats them as interactive too — because many models will output `\`\`\`html`instead of`\`\`\`interactive-html` despite the instruction

---

## Files to Modify

| File                             | Change                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `app/api/chat/route.ts`          | Replace VISUALIZATION_SYSTEM_PROMPT with shorter version                                          |
| `lib/hooks/useChatActions.ts`    | Add `augmentWithVisualizationHint()`, apply to all user message pushes, update locale instruction |
| `lib/utils/interactiveBlocks.ts` | Make regex case-insensitive, add `\`\`\`html` fallback detection                                  |

## Files NOT to Modify

- `components/chat/InteractiveBlock.tsx` — works fine as-is
- `components/chat/MessageItem.tsx` — already integrated
- `components/chat/UnifiedAnswerFlow.tsx` — already integrated
- Provider adapters — no changes needed

## Verification

After applying these fixes:

1. `npm run build` — must compile with zero errors
2. Open the app in Mongolian locale
3. Send: "create me interview prep guide. Visualized"
4. Expected: The model outputs HTML in an `interactive-html` (or `html`) code block, and it renders as an interactive iframe in the chat
5. The visible text content in the visualization should be in Mongolian (user's locale)
6. The code itself (HTML/CSS/JS) should be in English
7. Test with a non-visualization prompt like "what is 2+2" — should still produce normal plain text, no iframe
8. Test in compare mode — each model should independently produce its own visualization
