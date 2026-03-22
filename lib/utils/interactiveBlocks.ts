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
    /```mermaid\s*\n([\s\S]*?)```/g,
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
