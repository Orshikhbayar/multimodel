# PPTX Generation Feature — Implementation Prompt

You are adding presentation (PPTX) generation to a Next.js 16 multi-model AI chat application. When a user asks the AI to "create a presentation" or "make a slide deck," the AI should output structured slide data, and the app should generate and download a real .pptx file.

## How It Works (User's Perspective)

1. User types: "Create a 5-slide presentation about AI trends in Mongolia"
2. AI responds with a visual preview of the slides in the chat (using the existing `interactive-html` system)
3. A "Download PPTX" button appears below the preview
4. User clicks download → a real .pptx file is generated in-browser and downloaded

## Architecture

**Client-side generation using `pptxgenjs`.** This library is already installed in the project (`"pptxgenjs": "^4.0.1"` in package.json). It works in the browser — no server-side generation needed.

The flow has 3 parts:

1. **System prompt** tells the AI to output a structured JSON block (tagged `pptx-slides`) containing slide data
2. **Frontend parser** detects `pptx-slides` blocks in AI responses (similar to `interactive-html`)
3. **PptxBlock component** renders a visual preview + download button, and generates the .pptx client-side using pptxgenjs

---

## STEP 1: Extend the System Prompt

### File: `app/api/chat/route.ts`

The `VISUALIZATION_SYSTEM_PROMPT` constant already exists. Append PPTX generation instructions to it.

**Add this to the END of the existing VISUALIZATION_SYSTEM_PROMPT string:**

```
You also have the ability to generate PowerPoint presentations. When the user asks you to create a presentation, slide deck, pitch deck, or slides, you MUST respond with TWO things:

1. An \`interactive-html\` block showing a visual preview of the slides (use tabs for each slide, styled cards showing slide content)
2. A \`pptx-slides\` JSON block containing structured slide data for PPTX generation

The \`pptx-slides\` block format:
\`\`\`pptx-slides
{
  "title": "Presentation Title",
  "theme": {
    "background": "#1E2761",
    "titleColor": "#FFFFFF",
    "bodyColor": "#CADCFC",
    "accentColor": "#F96167"
  },
  "slides": [
    {
      "layout": "title",
      "title": "Main Title Here",
      "subtitle": "Subtitle or tagline"
    },
    {
      "layout": "content",
      "title": "Slide Title",
      "body": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
      "notes": "Speaker notes for this slide"
    },
    {
      "layout": "two-column",
      "title": "Comparison",
      "left": { "heading": "Option A", "points": ["Point 1", "Point 2"] },
      "right": { "heading": "Option B", "points": ["Point 1", "Point 2"] }
    },
    {
      "layout": "stat",
      "title": "Key Metrics",
      "stats": [
        { "value": "85%", "label": "Customer Satisfaction" },
        { "value": "$2.4M", "label": "Annual Revenue" },
        { "value": "150+", "label": "Clients Worldwide" }
      ]
    },
    {
      "layout": "content",
      "title": "Thank You",
      "body": ["Contact: email@example.com", "Questions?"]
    }
  ]
}
\`\`\`

Rules for pptx-slides:
1. Always include both the interactive-html preview AND the pptx-slides JSON block
2. Available layouts: "title", "content", "two-column", "stat"
3. Pick a bold color theme that matches the topic (don't default to blue)
4. Include speaker notes for content slides
5. Keep bullet points concise (under 15 words each)
6. 5-10 slides is the sweet spot unless the user specifies otherwise
7. The interactive-html preview should show a visual representation of the slides so the user can see what they're getting before downloading
```

---

## STEP 2: Create the Slide Data Types

### Create file: `lib/utils/pptxTypes.ts`

```typescript
export interface PptxTheme {
  background: string;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
}

export interface TitleSlide {
  layout: "title";
  title: string;
  subtitle?: string;
}

export interface ContentSlide {
  layout: "content";
  title: string;
  body: string[];
  notes?: string;
}

export interface TwoColumnSlide {
  layout: "two-column";
  title: string;
  left: { heading: string; points: string[] };
  right: { heading: string; points: string[] };
  notes?: string;
}

export interface StatSlide {
  layout: "stat";
  title: string;
  stats: Array<{ value: string; label: string }>;
  notes?: string;
}

export type Slide = TitleSlide | ContentSlide | TwoColumnSlide | StatSlide;

export interface PptxData {
  title: string;
  theme: PptxTheme;
  slides: Slide[];
}
```

---

## STEP 3: Create the PPTX Generator

### Create file: `lib/utils/generatePptx.ts`

This function takes structured slide data and generates a .pptx file using pptxgenjs in the browser.

```typescript
import PptxGenJS from "pptxgenjs";
import type { PptxData, Slide } from "./pptxTypes";

/**
 * Generates a .pptx file from structured slide data and triggers a browser download.
 */
export async function generateAndDownloadPptx(data: PptxData): Promise<void> {
  const pptx = new PptxGenJS();

  // Set presentation metadata
  pptx.title = data.title;
  pptx.author = "MultiModel AI";
  pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5" widescreen

  // Define master slides with theme colors
  const { background, titleColor, bodyColor, accentColor } = data.theme;

  // Font pairing
  const headingFont = "Trebuchet MS";
  const bodyFont = "Calibri";

  for (const slideData of data.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: background };

    switch (slideData.layout) {
      case "title":
        renderTitleSlide(slide, slideData, {
          headingFont,
          bodyFont,
          titleColor,
          bodyColor,
          accentColor,
        });
        break;
      case "content":
        renderContentSlide(slide, slideData, {
          headingFont,
          bodyFont,
          titleColor,
          bodyColor,
          accentColor,
        });
        break;
      case "two-column":
        renderTwoColumnSlide(slide, slideData, {
          headingFont,
          bodyFont,
          titleColor,
          bodyColor,
          accentColor,
        });
        break;
      case "stat":
        renderStatSlide(slide, slideData, {
          headingFont,
          bodyFont,
          titleColor,
          bodyColor,
          accentColor,
        });
        break;
    }

    // Add speaker notes
    if ("notes" in slideData && slideData.notes) {
      slide.addNotes(slideData.notes);
    }
  }

  // Generate and download
  const fileName = `${data.title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}.pptx`;
  await pptx.writeFile({ fileName });
}

interface StyleConfig {
  headingFont: string;
  bodyFont: string;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
}

function renderTitleSlide(
  slide: PptxGenJS.Slide,
  data: { title: string; subtitle?: string },
  style: StyleConfig,
) {
  // Centered title
  slide.addText(data.title, {
    x: 0.8,
    y: 2.0,
    w: 11.7,
    h: 1.5,
    fontSize: 44,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
    align: "center",
    valign: "bottom",
  });

  // Subtitle
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.8,
      y: 3.8,
      w: 11.7,
      h: 0.8,
      fontSize: 20,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      align: "center",
      valign: "top",
    });
  }

  // Accent line
  slide.addShape("rect", {
    x: 5.0,
    y: 3.5,
    w: 3.3,
    h: 0.06,
    fill: { color: style.accentColor },
  });
}

function renderContentSlide(
  slide: PptxGenJS.Slide,
  data: { title: string; body: string[] },
  style: StyleConfig,
) {
  // Slide title
  slide.addText(data.title, {
    x: 0.8,
    y: 0.4,
    w: 11.7,
    h: 0.8,
    fontSize: 32,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
  });

  // Bullet points
  const bulletItems = data.body.map((text) => ({
    text,
    options: {
      fontSize: 18,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      bullet: { type: "bullet" as const, color: style.accentColor },
      paraSpaceBefore: 8,
      paraSpaceAfter: 8,
    },
  }));

  slide.addText(bulletItems, {
    x: 0.8,
    y: 1.5,
    w: 11.7,
    h: 5.0,
    valign: "top",
  });
}

function renderTwoColumnSlide(
  slide: PptxGenJS.Slide,
  data: {
    title: string;
    left: { heading: string; points: string[] };
    right: { heading: string; points: string[] };
  },
  style: StyleConfig,
) {
  // Slide title
  slide.addText(data.title, {
    x: 0.8,
    y: 0.4,
    w: 11.7,
    h: 0.8,
    fontSize: 32,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
  });

  // Left column heading
  slide.addText(data.left.heading, {
    x: 0.8,
    y: 1.6,
    w: 5.5,
    h: 0.6,
    fontSize: 22,
    fontFace: style.headingFont,
    color: style.accentColor,
    bold: true,
  });

  // Left column points
  const leftItems = data.left.points.map((text) => ({
    text,
    options: {
      fontSize: 16,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      bullet: { type: "bullet" as const, color: style.accentColor },
      paraSpaceBefore: 6,
      paraSpaceAfter: 6,
    },
  }));

  slide.addText(leftItems, {
    x: 0.8,
    y: 2.3,
    w: 5.5,
    h: 4.5,
    valign: "top",
  });

  // Right column heading
  slide.addText(data.right.heading, {
    x: 7.0,
    y: 1.6,
    w: 5.5,
    h: 0.6,
    fontSize: 22,
    fontFace: style.headingFont,
    color: style.accentColor,
    bold: true,
  });

  // Right column points
  const rightItems = data.right.points.map((text) => ({
    text,
    options: {
      fontSize: 16,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      bullet: { type: "bullet" as const, color: style.accentColor },
      paraSpaceBefore: 6,
      paraSpaceAfter: 6,
    },
  }));

  slide.addText(rightItems, {
    x: 7.0,
    y: 2.3,
    w: 5.5,
    h: 4.5,
    valign: "top",
  });

  // Divider line
  slide.addShape("rect", {
    x: 6.45,
    y: 1.8,
    w: 0.03,
    h: 4.5,
    fill: { color: style.accentColor },
  });
}

function renderStatSlide(
  slide: PptxGenJS.Slide,
  data: { title: string; stats: Array<{ value: string; label: string }> },
  style: StyleConfig,
) {
  // Slide title
  slide.addText(data.title, {
    x: 0.8,
    y: 0.4,
    w: 11.7,
    h: 0.8,
    fontSize: 32,
    fontFace: style.headingFont,
    color: style.titleColor,
    bold: true,
  });

  // Stats in a row
  const statCount = data.stats.length;
  const totalWidth = 11.7;
  const statWidth = totalWidth / statCount;

  data.stats.forEach((stat, index) => {
    const xPos = 0.8 + index * statWidth;

    // Big number
    slide.addText(stat.value, {
      x: xPos,
      y: 2.2,
      w: statWidth - 0.3,
      h: 1.5,
      fontSize: 54,
      fontFace: style.headingFont,
      color: style.accentColor,
      bold: true,
      align: "center",
      valign: "bottom",
    });

    // Label
    slide.addText(stat.label, {
      x: xPos,
      y: 3.9,
      w: statWidth - 0.3,
      h: 0.8,
      fontSize: 16,
      fontFace: style.bodyFont,
      color: style.bodyColor,
      align: "center",
      valign: "top",
    });
  });
}
```

---

## STEP 4: Create the PptxBlock Component

### Create file: `components/chat/PptxBlock.tsx`

This component renders a download button when it detects `pptx-slides` JSON in the AI response. The visual preview is already handled by the `interactive-html` block.

```tsx
"use client";

import { useState, useCallback } from "react";
import { Download, FileText, Loader2, Check } from "lucide-react";

interface PptxBlockProps {
  jsonString: string;
}

/**
 * Renders a download button for PPTX generation.
 * The JSON data is parsed and passed to pptxgenjs for client-side generation.
 */
export default function PptxBlock({ jsonString }: PptxBlockProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleDownload = useCallback(async () => {
    setStatus("generating");
    try {
      const data = JSON.parse(jsonString);

      // Dynamic import to avoid loading pptxgenjs until needed
      const { generateAndDownloadPptx } = await import("@/lib/utils/generatePptx");
      await generateAndDownloadPptx(data);

      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      console.error("PPTX generation failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Generation failed");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }, [jsonString]);

  return (
    <div className="my-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-muted/20 px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15">
        <FileText className="h-5 w-5 text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {(() => {
            try {
              return JSON.parse(jsonString).title || "Presentation";
            } catch {
              return "Presentation";
            }
          })()}
          .pptx
        </p>
        <p className="text-[11px] text-muted-foreground">
          {(() => {
            try {
              const slides = JSON.parse(jsonString).slides;
              return `${slides?.length || 0} slides • PowerPoint`;
            } catch {
              return "PowerPoint";
            }
          })()}
        </p>
      </div>
      <button
        onClick={handleDownload}
        disabled={status === "generating"}
        className="flex items-center gap-2 rounded-lg bg-orange-500/15 px-3.5 py-2 text-xs font-medium text-orange-400 transition hover:bg-orange-500/25 disabled:opacity-50"
      >
        {status === "generating" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : status === "done" ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Downloaded
          </>
        ) : status === "error" ? (
          <span className="text-red-400">{errorMessage}</span>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            Download PPTX
          </>
        )}
      </button>
    </div>
  );
}
```

---

## STEP 5: Extend splitInteractiveBlocks to Detect pptx-slides

### File: `lib/utils/interactiveBlocks.ts`

The existing `splitInteractiveBlocks` function detects `interactive-html` blocks. Extend it to also detect `pptx-slides` blocks.

**Update the return type and add a new segment type:**

```typescript
export type SegmentType = "text" | "interactive" | "pptx";

export function splitInteractiveBlocks(
  content: string,
): Array<{ type: SegmentType; content: string }> {
  const segments: Array<{ type: SegmentType; content: string }> = [];

  // --- EXISTING: Convert mermaid blocks (keep as-is) ---
  content = content.replace(
    /```mermaid\s*\n([\s\S]*?)```/gi,
    (_, mermaidCode: string) => {
      // ... keep existing mermaid conversion code unchanged ...
    },
  );

  // --- NEW: Extract pptx-slides blocks FIRST (before interactive-html) ---
  const pptxSegments: Array<{ start: number; end: number; content: string }> = [];
  const pptxRegex = /```pptx-slides\s*\n([\s\S]*?)```/gi;
  let pptxMatch;
  while ((pptxMatch = pptxRegex.exec(content)) !== null) {
    pptxSegments.push({
      start: pptxMatch.index,
      end: pptxMatch.index + pptxMatch[0].length,
      content: pptxMatch[1].trim(),
    });
  }

  // --- EXISTING: Match interactive-html blocks (keep as-is) ---
  const regex =
    /```(?:interactive-html|interactive[-_\s]?html)\s*\n([\s\S]*?)```/gi;
  // ... keep existing logic ...

  // After building segments from interactive-html, also add pptx segments.
  // The simplest approach: process ALL special blocks in order of appearance.

  // ... see full implementation approach below ...
}
```

**IMPORTANT — Simpler approach:** Instead of deeply refactoring the parser, just detect `pptx-slides` blocks separately AFTER the main split. Here's the recommended approach:

```typescript
/**
 * Splits message content into text, interactive-html, and pptx-slides segments.
 */
export type SegmentType = "text" | "interactive" | "pptx";

export function splitInteractiveBlocks(
  content: string,
): Array<{ type: SegmentType; content: string }> {
  const segments: Array<{ type: SegmentType; content: string }> = [];

  // Convert mermaid blocks (keep existing code)
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

  // Match ALL special blocks in order: interactive-html and pptx-slides
  const combinedRegex =
    /```((?:interactive-html|interactive[-_\s]?html)|pptx-slides)\s*\n([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(content)) !== null) {
    // Text before this block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", content: text });
    }

    // Determine block type
    const tag = match[1].toLowerCase();
    const blockContent = match[2].trim();

    if (tag === "pptx-slides") {
      segments.push({ type: "pptx", content: blockContent });
    } else {
      segments.push({ type: "interactive", content: blockContent });
    }

    lastIndex = match.index + match[0].length;
  }

  // FALLBACK: check for ```html blocks (keep existing fallback)
  if (segments.length === 0) {
    const htmlFallbackRegex = /```html\s*\n([\s\S]*?)```/gi;
    let htmlMatch;
    lastIndex = 0;

    while ((htmlMatch = htmlFallbackRegex.exec(content)) !== null) {
      const htmlContent = htmlMatch[1].trim();
      if (htmlContent.match(/<!doctype\s+html|<html|<head[\s>]|<body[\s>]/i)) {
        if (htmlMatch.index > lastIndex) {
          const text = content.slice(lastIndex, htmlMatch.index).trim();
          if (text) segments.push({ type: "text", content: text });
        }
        segments.push({ type: "interactive", content: htmlContent });
        lastIndex = htmlMatch.index + htmlMatch[0].length;
      }
    }

    if (lastIndex > 0 && lastIndex < content.length) {
      const text = content.slice(lastIndex).trim();
      if (text) segments.push({ type: "text", content: text });
    }
  } else {
    if (lastIndex < content.length) {
      const text = content.slice(lastIndex).trim();
      if (text) segments.push({ type: "text", content: text });
    }
  }

  // If nothing found, return as plain text
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "text", content: content.trim() });
  }

  return segments;
}
```

---

## STEP 6: Wire PptxBlock into MessageItem

### File: `components/chat/MessageItem.tsx`

Add PptxBlock import and handle the "pptx" segment type in the rendering logic.

**Add import:**
```typescript
import PptxBlock from "./PptxBlock";
```

**In the segment rendering `.map()`, add the pptx case:**

Find where segments are mapped (the section that renders `InteractiveBlock` for "interactive" type and `ReactMarkdown` for "text" type). Add:

```tsx
segment.type === "pptx" ? (
  <PptxBlock key={i} jsonString={segment.content} />
) : segment.type === "interactive" ? (
  <InteractiveBlock key={i} html={segment.content} />
) : (
  <ReactMarkdown key={i} ...>
    {segment.content}
  </ReactMarkdown>
)
```

### File: `components/chat/UnifiedAnswerFlow.tsx`

Same change — add PptxBlock import and handle "pptx" segments in compare mode.

---

## STEP 7: Add PPTX Toggle to Composer (Optional Enhancement)

### File: `components/Composer.tsx`

Add a "Slides" toggle button next to the existing Web/Image/Attach toggles. This is NOT gated by plan — all users can generate presentations.

**Add import:**
```typescript
import { Presentation } from "lucide-react";
```

Note: If `Presentation` doesn't exist in the installed lucide-react version, use `FileSliders` or `LayoutDashboard` instead.

**Add state:**
```typescript
const [slidesEnabled, setSlidesEnabled] = useState(false);
```

**Add button** after the Attach button:
```tsx
<button
  type="button"
  title="Generate Presentation"
  onClick={() => setSlidesEnabled((v) => !v)}
  className={cn(
    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
    slidesEnabled
      ? "bg-orange-500/15 text-orange-400"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  )}
>
  <Presentation className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Slides</span>
</button>
```

When `slidesEnabled` is true, append " [Generate this as a downloadable PowerPoint presentation with an interactive preview]" to the user's message before sending. This works similarly to how the visualization trigger augments the message.

---

## Verification Checklist

1. **Build compiles:** `npm run build` — zero TypeScript errors
2. **Send a prompt:** "Create a 5-slide presentation about AI trends in Mongolia"
3. **Expected AI response:** An `interactive-html` block showing a visual slide preview, AND a `pptx-slides` JSON block with structured data
4. **Expected UI:** Visual preview renders in chat (via InteractiveBlock), and a download card with "Download PPTX" button appears below it
5. **Click download:** A .pptx file should download. Open it in PowerPoint/Google Slides — verify it has the correct number of slides, themed colors, and formatted text
6. **Compare mode:** Both models should independently generate presentations
7. **Normal prompts unaffected:** Regular text prompts should work normally with no PPTX blocks
8. **Error handling:** If the JSON is malformed, the download button should show an error message, not crash

---

## Files Created/Modified Summary

| Action | File |
|--------|------|
| MODIFIED | `app/api/chat/route.ts` — Extend VISUALIZATION_SYSTEM_PROMPT with pptx-slides instructions |
| CREATED | `lib/utils/pptxTypes.ts` — TypeScript types for slide data |
| CREATED | `lib/utils/generatePptx.ts` — pptxgenjs wrapper for client-side generation |
| CREATED | `components/chat/PptxBlock.tsx` — Download card component |
| MODIFIED | `lib/utils/interactiveBlocks.ts` — Add `pptx` segment type detection |
| MODIFIED | `components/chat/MessageItem.tsx` — Render PptxBlock for pptx segments |
| MODIFIED | `components/chat/UnifiedAnswerFlow.tsx` — Same integration for compare mode |
| MODIFIED (optional) | `components/Composer.tsx` — Add Slides toggle button |

**Do NOT modify:**
- Provider adapters
- Billing logic (PPTX generation is free for all users — it's client-side, costs nothing)
- Database schema
- Sidebar or routing

**Dependencies:** `pptxgenjs` is already installed. No new packages needed.

---

## IMPORTANT NOTE: Order of Implementation

**Implement the VISUALIZER_FIX_PROMPT.md FIRST.** The PPTX feature depends on the interactive-html system working correctly (models need to output structured code blocks, which is currently broken). Fix the visualizer, verify it works, then implement this PPTX feature.

The implementation order should be:
1. `VISUALIZER_FIX_PROMPT.md` — fix system prompt and client-side augmentation
2. This prompt (`PPTX_GENERATION_PROMPT.md`) — add presentation generation
