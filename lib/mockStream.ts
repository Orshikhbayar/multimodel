import type {
  Disagreement,
  InteractionMode,
  Run,
  Source,
} from "./types";

type StreamCallbacks = {
  onToken: (chunk: string) => void;
  onDone: (payload: Partial<Run>) => void;
  onError?: (message: string) => void;
};

interface StreamOptions extends StreamCallbacks {
  model: string;
  mode: InteractionMode;
  delay?: number;
}

export const SOURCE_LIBRARY: Source[] = [
  {
    title: "ARC Tech Trends 2025",
    url: "https://arc.example.com/trends",
    date: "2025-01-10",
    snippet:
      "Highlights momentum around agentic workflows and grounded retrieval.",
  },
  {
    title: "Stanford HAI - Multi-Agent Patterns",
    url: "https://hai.stanford.edu/multi-agent",
    date: "2024-11-02",
    snippet:
      "Shows structured collaboration beats single-shot prompting on planning tasks.",
  },
  {
    title: "MIT News - Evaluating AI Debates",
    url: "https://news.mit.edu/ai-debates",
    snippet:
      "User studies indicate transparency and critique improve trust in answers.",
  },
  {
    title: "NYT - Search as Grounding",
    url: "https://nytimes.com/grounded-ai",
  },
];

export const DEBATE_TAKES: Disagreement[] = [
  {
    claim: "Shipping a lean MVP in 4 weeks is feasible.",
    models: [
      { model: "GPT-4.1", stance: "supports with cautions on QA" },
      { model: "Claude 3.5", stance: "partially disagrees due to compliance" },
      { model: "Grok 3", stance: "agrees and suggests aggressive automation" },
    ],
  },
  {
    claim: "We should prioritize web search over vector memory.",
    models: [
      { model: "Gemini 2.0", stance: "prefers blended retrieval" },
      { model: "GPT-4.1", stance: "disagrees, suggests cached snippets" },
    ],
  },
];

const MODEL_NOTES: Record<string, string[]> = {
  "GPT-4.1": [
    "Synthesizing the request with concise reasoning steps.",
    "Highlighting gaps and proposing next actions with bulletproof clarity.",
    "Balancing brevity with just enough detail to stay actionable.",
  ],
  "Claude 3.5": [
    "Adding nuance, risk notes, and softer phrasing for stakeholders.",
    "Double-checking ambiguous phrases and surfacing assumptions.",
    "Suggesting red-team style checks where plans feel brittle.",
  ],
  "Gemini 2.0": [
    "Layering in retrieval cues and traceable evidence.",
    "Offering parallel paths when certainty is low.",
    "Infusing multi-modal hooks for future expansions.",
  ],
  "Grok 3": [
    "Taking a bold stance and focusing on speed to delivery.",
    "Leaning into automation and sharp one-liners.",
    "Calling out where irreverence can still be safe.",
  ],
};

const BASE_FALLBACK = [
  "Outlining the objective and constraints.",
  "Breaking work into atomic, delegate-ready chunks.",
  "Tracking evaluation hooks so results are measurable.",
  "Marking dependencies and owners to unblock execution.",
];

function buildTokens(model: string, mode: InteractionMode) {
  const voice = MODEL_NOTES[model] ?? BASE_FALLBACK;
  const intro =
    mode === "web"
      ? "Pulling in recent citations and threading them into the answer."
      : mode === "debate"
        ? "Taking a stance and challenging alternative views."
        : mode === "expert"
          ? "Writing in a crisp expert tone, then inviting critique."
          : "Drafting a confident response tailored to the prompt.";

  return [intro, ...voice].flatMap((sentence) => sentence.split(" "));
}

function randomSources(): Source[] {
  const shuffled = [...SOURCE_LIBRARY].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}

export function startMockStream({
  model,
  mode,
  onToken,
  onDone,
  onError,
  delay = 50,
}: StreamOptions) {
  const tokens = buildTokens(model, mode);
  let index = 0;
  const chunks: string[] = [];
  let interval: ReturnType<typeof setInterval> | null = null;

  const timeout = setTimeout(() => {
    interval = setInterval(() => {
      if (index >= tokens.length) {
        if (interval) {
          clearInterval(interval);
        }
        const payload: Partial<Run> = {
          text: chunks.join(" "),
          status: "done",
        };

        if (mode === "web") {
          payload.sources = randomSources();
        }
        if (mode === "debate" || mode === "ensemble") {
          payload.disagreements = DEBATE_TAKES;
        }

        onDone(payload);
        return;
      }

      const token = tokens[index];
      chunks.push(token);
      onToken(`${token} `);
      index += 1;
    }, 140);
  }, delay);

  return () => {
    clearTimeout(timeout);
    if (interval) {
      clearInterval(interval);
    }
    onError?.("Stream cancelled.");
  };
}
