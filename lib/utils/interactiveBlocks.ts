import { markdownToInteractiveHtml } from "./markdownToHtml";
import { markdownToPptxData } from "./markdownToPptx";

/**
 * Splits a message string into segments of plain text, interactive-html blocks,
 * and pptx-slides blocks.
 *
 * If `userIntent` is provided and the model didn't output special blocks,
 * the plain text is auto-transformed client-side (no model cooperation needed).
 */
export type SegmentType = "text" | "interactive" | "pptx";
export type Segment = { type: SegmentType; content: string };

const VIZ_TRIGGERS =
  /\b(visualiz\w*|interactive|diagram|chart|dashboard|infographic|flowchart|graph|timeline)\b/i;
const PPTX_TRIGGERS =
  /\b(presentation|slide|pptx|powerpoint|deck|pitch\s*deck)\b/i;

export function splitInteractiveBlocks(
  content: string,
  userMessage?: string,
): Segment[] {
  const segments: Segment[] = [];

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

  // Combined regex: match interactive-html OR pptx-slides blocks
  const regex =
    /```(?:(interactive-html|interactive[-_\s]?html)|(pptx-slides|pptx[-_\s]?slides))\s*\n([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", content: text });
    }
    const blockType: SegmentType = match[1] ? "interactive" : "pptx";
    segments.push({ type: blockType, content: match[3].trim() });
    lastIndex = match.index + match[0].length;
  }

  // FALLBACK: check for ```html blocks with full HTML documents
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

  // ─── CLIENT-SIDE AUTO-TRANSFORM ───
  // If the model just output plain text but the user asked for viz/pptx,
  // transform it here. No model cooperation needed.
  const hasSpecialBlocks = segments.some(
    (s) => s.type === "interactive" || s.type === "pptx",
  );

  if (!hasSpecialBlocks && userMessage && content.trim()) {
    const wantsViz = VIZ_TRIGGERS.test(userMessage);
    const wantsPptx = PPTX_TRIGGERS.test(userMessage);

    if (wantsPptx) {
      const pptxData = markdownToPptxData(content);
      if (pptxData) {
        return [
          { type: "text", content: content.trim() },
          { type: "pptx", content: JSON.stringify(pptxData) },
        ];
      }
    }

    if (wantsViz) {
      const html = markdownToInteractiveHtml(content);
      if (html) {
        return [{ type: "interactive", content: html }];
      }
    }
  }

  // Default: plain text
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "text", content: content.trim() });
  }

  return segments;
}
