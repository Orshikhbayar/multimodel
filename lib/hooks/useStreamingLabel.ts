"use client";

import { useEffect, useState } from "react";

const LABEL_MAP: Array<{ pattern: RegExp; labels: string[] }> = [
  {
    pattern: /\b(code|function|class|import|const|def|return)\b/i,
    labels: [
      "Writing the code...",
      "Building the implementation...",
      "Structuring the solution...",
    ],
  },
  {
    pattern: /\b(analyz|compar|evaluat|assess)\w*/i,
    labels: [
      "Comparing perspectives...",
      "Analyzing the options...",
      "Weighing the tradeoffs...",
    ],
  },
  {
    pattern: /\b(step|first|second|then|finally)\b/i,
    labels: [
      "Breaking it down...",
      "Structuring the steps...",
      "Working through it...",
    ],
  },
  {
    pattern: /\b(data|chart|graph|visualiz|diagram)\w*/i,
    labels: [
      "Building the visualization...",
      "Structuring the data...",
      "Rendering the diagram...",
    ],
  },
  {
    pattern: /\b(research|source|according|study|found)\w*/i,
    labels: [
      "Pulling from sources...",
      "Cross-referencing...",
      "Synthesizing research...",
    ],
  },
];

const DEFAULT_LABELS = ["Synthesizing...", "Thinking...", "Processing..."];

/**
 * Returns a context-aware streaming label based on content and status.
 * Rotates between label variants every 2.5s while streaming.
 */
export function useStreamingLabel(text: string, status: string): string {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "streaming") {
      return;
    }
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, [status]);

  const matchedEntry = LABEL_MAP.find((entry) => entry.pattern.test(text));
  const labels = matchedEntry?.labels ?? DEFAULT_LABELS;

  if (status !== "streaming" || text.length >= 200) {
    return labels[0];
  }

  return labels[tick % labels.length];
}
