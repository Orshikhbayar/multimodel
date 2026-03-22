/**
 * Splits a message string into segments of plain text and interactive-html blocks.
 * Returns an array of { type: 'text' | 'interactive', content: string } objects.
 */
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

  // Match ```interactive-html ... ``` blocks (case-insensitive, allow variations)
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
  // that contain full HTML documents. Some models output ```html instead of
  // ```interactive-html despite the instruction.
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
