/**
 * Converts a markdown AI response into a self-contained interactive HTML document.
 * This runs CLIENT-SIDE — no model cooperation needed.
 * Used when the user asks for a "visualization" but the model responds with plain text.
 */
export function markdownToInteractiveHtml(markdown: string): string {
  // Parse markdown into sections based on headers
  const sections = parseMarkdownSections(markdown);

  if (sections.length === 0) {
    return "";
  }

  const title = sections[0].isHeader
    ? sections[0].title
    : "Interactive Guide";

  const tabsHtml = sections
    .filter((s) => s.isHeader)
    .map(
      (s, i) =>
        `<button class="tab${i === 0 ? " active" : ""}" onclick="showTab(${i})">${escHtml(s.title)}</button>`,
    )
    .join("\n");

  const panelsHtml = sections
    .filter((s) => s.isHeader)
    .map(
      (s, i) =>
        `<div class="panel${i === 0 ? " active" : ""}" id="panel-${i}">
        ${renderSectionContent(s)}
      </div>`,
    )
    .join("\n");

  // If only 1 section (no headers), render as a single card
  if (sections.filter((s) => s.isHeader).length <= 1) {
    const content = sections.map((s) => renderSectionContent(s)).join("\n");
    return buildHtmlDoc(
      title,
      `<div class="card">${content}</div>`,
      false,
    );
  }

  return buildHtmlDoc(
    title,
    `<div class="tabs">${tabsHtml}</div>\n${panelsHtml}`,
    true,
  );
}

interface Section {
  title: string;
  isHeader: boolean;
  bullets: string[];
  paragraphs: string[];
}

function parseMarkdownSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      if (current) sections.push(current);
      current = {
        title: headerMatch[1].replace(/\*\*/g, ""),
        isHeader: true,
        bullets: [],
        paragraphs: [],
      };
    } else {
      if (!current) {
        current = { title: "", isHeader: false, bullets: [], paragraphs: [] };
      }
      const bulletMatch = line.match(/^[-*•]\s+(.+)/);
      const numberedMatch = line.match(/^\d+[.)]\s+(.+)/);
      if (bulletMatch) {
        current.bullets.push(bulletMatch[1]);
      } else if (numberedMatch) {
        current.bullets.push(numberedMatch[1]);
      } else if (line.trim()) {
        current.paragraphs.push(line.trim());
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderSectionContent(s: Section): string {
  let html = "";
  for (const p of s.paragraphs) {
    html += `<p>${formatInlineMarkdown(escHtml(p))}</p>\n`;
  }
  if (s.bullets.length > 0) {
    html += "<ul>\n";
    for (const b of s.bullets) {
      html += `  <li>${formatInlineMarkdown(escHtml(b))}</li>\n`;
    }
    html += "</ul>\n";
  }
  return html || "<p><em>No content</em></p>";
}

function formatInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlDoc(
  title: string,
  body: string,
  hasTabs: boolean,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:24px;line-height:1.6}
h1{font-size:1.5rem;font-weight:700;margin-bottom:16px;color:#fff}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
.tab{padding:8px 16px;border:1px solid #333;border-radius:8px;background:#16213e;color:#a0a0c0;cursor:pointer;font-size:.85rem;transition:all .2s}
.tab:hover{background:#1a2744;color:#e0e0e0}
.tab.active{background:#6c63ff;color:#fff;border-color:#6c63ff}
.panel{display:none;animation:fadeIn .3s ease}
.panel.active{display:block}
.card{background:#16213e;border:1px solid #2a2a4a;border-radius:12px;padding:20px;margin-bottom:12px}
p{margin-bottom:10px;color:#c0c0d0}
ul{margin:10px 0 10px 20px;list-style:none}
ul li{position:relative;padding:6px 0 6px 16px;color:#c0c0d0}
ul li::before{content:"▸";position:absolute;left:0;color:#6c63ff}
strong{color:#fff}
em{color:#a78bfa}
code{background:#0f3460;padding:2px 6px;border-radius:4px;font-size:.85em;color:#7dd3fc}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<h1>${escHtml(title)}</h1>
${body}
${hasTabs ? `<script>
function showTab(idx){
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.querySelectorAll('.panel').forEach((p,i)=>p.classList.toggle('active',i===idx));
}
</script>` : ""}
</body>
</html>`;
}
