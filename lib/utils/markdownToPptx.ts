import type { PptxData, SlideData } from "./pptxTypes";

/**
 * Parses a markdown AI response into PptxData for slide generation.
 * Runs CLIENT-SIDE — no model cooperation needed.
 * Each ## header becomes a slide. Bullets become slide content.
 */
export function markdownToPptxData(markdown: string, fallbackTitle?: string): PptxData | null {
  const lines = markdown.split("\n");
  const slides: SlideData[] = [];
  let deckTitle = fallbackTitle || "Presentation";
  let currentSlide: { title: string; bullets: string[] } | null = null;

  for (const line of lines) {
    // # Top-level header = deck title
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      deckTitle = h1Match[1].replace(/\*\*/g, "").trim();
      continue;
    }

    // ## Second-level header = new slide
    const h2Match = line.match(/^#{2,3}\s+(.+)/);
    if (h2Match) {
      if (currentSlide) {
        slides.push(buildSlide(currentSlide));
      }
      currentSlide = {
        title: h2Match[1].replace(/\*\*/g, "").trim(),
        bullets: [],
      };
      continue;
    }

    // Bullets
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (bulletMatch && currentSlide) {
      currentSlide.bullets.push(cleanMarkdown(bulletMatch[1]));
    } else if (numberedMatch && currentSlide) {
      currentSlide.bullets.push(cleanMarkdown(numberedMatch[1]));
    } else if (line.trim() && currentSlide && currentSlide.bullets.length === 0) {
      // Non-bullet text goes as a bullet too if it's not empty
      currentSlide.bullets.push(cleanMarkdown(line.trim()));
    }
  }

  // Push last slide
  if (currentSlide) {
    slides.push(buildSlide(currentSlide));
  }

  if (slides.length === 0) {
    return null;
  }

  // Add title slide at the beginning
  const titleSlide: SlideData = {
    layout: "title",
    title: deckTitle,
    subtitle: `${slides.length} slides`,
  };

  return {
    title: deckTitle,
    slides: [titleSlide, ...slides],
  };
}

function buildSlide(data: { title: string; bullets: string[] }): SlideData {
  if (data.bullets.length === 0) {
    return { layout: "title", title: data.title };
  }
  return {
    layout: "content",
    title: data.title,
    bullets: data.bullets.slice(0, 8), // Max 8 bullets per slide
  };
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}
