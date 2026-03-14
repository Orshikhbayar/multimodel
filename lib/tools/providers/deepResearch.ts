/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ToolExecutionContext } from "@/lib/tools/types";
import { webFetchTool, webSearchTool } from "@/lib/tools/providers/webTools";

interface DeepResearchInput {
  topic: string;
  goals?: string[];
  constraints?: string[];
  audience?: string;
  recency_days?: number;
  max_sources?: number;
  depth_level?: "light" | "standard" | "deep";
}

interface Citation {
  id: string;
  url: string;
  title: string;
  publisher?: string;
  published_date?: string;
  accessed_at: string;
}

interface SourceBundleItem {
  url: string;
  content_hash: string;
  extracted_text_ref: string;
  metadata: Record<string, unknown>;
}

interface ResearchTrace {
  plan: {
    objective: string;
    scope_boundaries: string[];
    key_questions: string[];
    success_criteria: string[];
    steps: string[];
  };
  queries: string[];
  chosen_sources: Array<{
    url: string;
    title: string;
    score: number;
    breakdown: {
      authority: number;
      relevance: number;
      recency: number;
      redundancy: number;
    };
  }>;
  scoring: Array<{
    url: string;
    title: string;
    authority: number;
    relevance: number;
    recency: number;
    redundancy: number;
    final: number;
  }>;
  tool_call_log: Array<{
    tool: string;
    input: Record<string, unknown>;
    output_summary: string;
    at: string;
  }>;
  conflicts: string[];
  uncertainty_notes: string[];
}

interface DeepResearchOutput {
  report_markdown: string;
  citations: Citation[];
  source_bundle: SourceBundleItem[];
  research_trace: ResearchTrace;
  report_id: string;
  what_changed_recently?: string;
}

function keywordSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

function overlapScore(needle: Set<string>, haystack: Set<string>): number {
  if (needle.size === 0) return 0;

  let matched = 0;

  for (const token of needle) {
    if (haystack.has(token)) {
      matched += 1;
    }
  }

  return matched / needle.size;
}

function authorityFromUrl(url: string): number {
  const domain = new URL(url).hostname.toLowerCase();

  if (domain.endsWith(".gov") || domain.endsWith(".edu")) return 1;
  if (
    domain.includes("developer") ||
    domain.includes("docs") ||
    domain.includes("standards")
  )
    return 0.95;
  if (domain.includes("wikipedia")) return 0.6;
  if (domain.includes("medium") || domain.includes("substack")) return 0.4;

  return 0.7;
}

function recencyScore(
  dateValue: string | undefined,
  recencyDays?: number,
): number {
  if (!recencyDays) return 0.7;
  if (!dateValue) return 0.3;

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return 0.3;

  const daysOld = (Date.now() - parsed.getTime()) / (24 * 60 * 60_000);
  if (daysOld <= recencyDays) return 1;
  if (daysOld <= recencyDays * 2) return 0.7;
  if (daysOld <= recencyDays * 4) return 0.4;
  return 0.2;
}

function dedupeSources<T extends { url: string; content_hash?: string }>(
  entries: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const entry of entries) {
    const key = entry.content_hash
      ? `hash:${entry.content_hash}`
      : `url:${entry.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }

  return result;
}

function buildPlan(input: DeepResearchInput) {
  const goals = input.goals?.length
    ? input.goals
    : ["Build factual, cited answer"];
  const constraints = input.constraints?.length
    ? input.constraints
    : ["Prefer primary sources", "Cite every substantive claim"];

  const keyQuestions = [
    `What is the current state of ${input.topic}?`,
    `What are the main tradeoffs, risks, and alternatives related to ${input.topic}?`,
    `What changed recently for ${input.topic}?`,
  ];

  return {
    objective: `Produce a decision-grade brief on ${input.topic}`,
    scope_boundaries: constraints,
    key_questions: keyQuestions,
    success_criteria: [
      "At least one citation per major claim",
      "Conflicts between sources are explicitly noted",
      "Output is actionable for the requested audience",
    ],
    steps: [
      "Generate focused search queries",
      "Collect and fetch candidate sources",
      "Score source quality and relevance",
      "Synthesize report with citations and uncertainty notes",
    ],
    goals,
  };
}

function buildQueries(
  topic: string,
  plan: ReturnType<typeof buildPlan>,
  recencyDays?: number,
): string[] {
  const baseQueries = [
    `${topic} official documentation`,
    `${topic} latest updates`,
    `${topic} comparison alternatives`,
  ];

  if (recencyDays) {
    const currentYear = new Date().getUTCFullYear();
    baseQueries.push(`${topic} ${currentYear}`);
    if (recencyDays > 180) {
      baseQueries.push(`${topic} ${currentYear - 1}`);
    }
  }

  return [...new Set([...baseQueries, ...plan.key_questions])];
}

function summarizeForQuestion(
  question: string,
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    citationId: string;
  }>,
): string {
  const top = sources.slice(0, 3);

  if (top.length === 0) {
    return `No high-confidence sources were found for: ${question}`;
  }

  const lines = top.map(
    (source) =>
      `- ${source.snippet.slice(0, 220)}${source.snippet.length > 220 ? "..." : ""} (${source.citationId})`,
  );

  return [`Key findings for **${question}**:`, ...lines].join("\n");
}

function detectConflicts(
  entries: Array<{ title: string; detected_date?: string; url: string }>,
): string[] {
  const conflicts: string[] = [];

  const byTitle = new Map<string, string[]>();

  for (const entry of entries) {
    const key = entry.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const existing = byTitle.get(key) ?? [];

    if (entry.detected_date) {
      existing.push(entry.detected_date);
      byTitle.set(key, existing);
    }
  }

  for (const [title, dates] of byTitle.entries()) {
    if (dates.length < 2) continue;

    const unique = [...new Set(dates)].sort();
    if (unique.length >= 2) {
      conflicts.push(
        `Sources on "${title}" reference different publication dates (${unique.join(", ")}). Review timeline-sensitive claims.`,
      );
    }
  }

  return conflicts;
}

export async function deepResearchTool(
  context: ToolExecutionContext,
  input: DeepResearchInput,
): Promise<DeepResearchOutput> {
  const startedAt = new Date().toISOString();
  const maxSources = Math.min(20, Math.max(4, input.max_sources ?? 10));
  const plan = buildPlan(input);
  const queries = buildQueries(input.topic, plan, input.recency_days);

  const callLog: ResearchTrace["tool_call_log"] = [];
  const candidateSources: Array<{
    query: string;
    title: string;
    url: string;
    snippet: string;
    published_date?: string;
    fetched_text: string;
    content_hash: string;
    metadata: Record<string, unknown>;
    detected_date?: string;
  }> = [];

  for (const query of queries) {
    const searchResults = await webSearchTool(context, {
      query,
      top_k: 5,
      recency_days: input.recency_days,
    });

    callLog.push({
      tool: "web_search",
      input: { query, top_k: 5 },
      output_summary: `${searchResults.length} results`,
      at: new Date().toISOString(),
    });

    for (const result of searchResults.slice(0, 3)) {
      try {
        const fetched = await webFetchTool(context, {
          url: result.canonical_url,
        });

        callLog.push({
          tool: "web_fetch",
          input: { url: result.canonical_url },
          output_summary: `${fetched.word_count} words`,
          at: new Date().toISOString(),
        });

        candidateSources.push({
          query,
          title: result.title,
          url: result.canonical_url,
          snippet: result.snippet,
          published_date: result.published_date,
          fetched_text: fetched.clean_text,
          content_hash: fetched.content_hash,
          metadata: fetched.metadata,
          detected_date: fetched.detected_date,
        });
      } catch {
        // Ignore fetch failures and keep search breadth.
      }
    }
  }

  const deduped = dedupeSources(candidateSources);
  const topicTerms = keywordSet(input.topic);

  const scored = deduped.map((source) => {
    const sourceTerms = keywordSet(
      `${source.title} ${source.snippet} ${source.fetched_text.slice(0, 1200)}`,
    );
    const authority = authorityFromUrl(source.url);
    const relevance = overlapScore(topicTerms, sourceTerms);
    const recency = recencyScore(
      source.published_date ?? source.detected_date,
      input.recency_days,
    );
    const redundancy = 1;

    const final = Number(
      (
        authority * 0.35 +
        relevance * 0.4 +
        recency * 0.2 +
        redundancy * 0.05
      ).toFixed(4),
    );

    return {
      ...source,
      authority,
      relevance,
      recency,
      redundancy,
      final,
    };
  });

  scored.sort((left, right) => right.final - left.final);

  const selected = scored.slice(0, maxSources);
  const citations: Citation[] = selected.map((source, index) => ({
    id: `S${index + 1}`,
    url: source.url,
    title: source.title,
    publisher:
      typeof source.metadata.publisher === "string"
        ? source.metadata.publisher
        : undefined,
    published_date: source.published_date ?? source.detected_date,
    accessed_at: startedAt,
  }));

  const sourceBundle: SourceBundleItem[] = selected.map((source) => ({
    url: source.url,
    content_hash: source.content_hash,
    extracted_text_ref: `web_pages_cache:${source.content_hash}`,
    metadata: source.metadata,
  }));

  const byQuestion = plan.key_questions.map((question) => {
    const questionTerms = keywordSet(question);

    const supporting = selected
      .map((source, index) => {
        const sourceTerms = keywordSet(`${source.title} ${source.snippet}`);
        return {
          source,
          relevance: overlapScore(questionTerms, sourceTerms),
          citationId: citations[index]?.id ?? `S${index + 1}`,
        };
      })
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, 3)
      .map((entry) => ({
        title: entry.source.title,
        url: entry.source.url,
        snippet: entry.source.snippet,
        citationId: entry.citationId,
      }));

    return summarizeForQuestion(question, supporting);
  });

  const conflicts = detectConflicts(selected);
  const uncertaintyNotes: string[] = [];

  if (selected.length < Math.max(4, Math.floor(maxSources / 2))) {
    uncertaintyNotes.push(
      "Fewer high-quality sources were available than requested. Confidence is reduced.",
    );
  }

  if (conflicts.length > 0) {
    uncertaintyNotes.push(
      "Conflicting publication timelines were detected; date-sensitive claims need manual verification.",
    );
  }

  const reportMarkdown = [
    `# Research Report: ${input.topic}`,
    "",
    `## Objective`,
    plan.objective,
    "",
    `## Audience`,
    input.audience ?? "General technical audience",
    "",
    `## Findings`,
    ...byQuestion,
    "",
    "## Source Quality Notes",
    ...selected.slice(0, 6).map((source, index) => {
      const citation = citations[index];
      return `- ${citation?.id ?? "S?"}: score=${source.final.toFixed(2)} (authority=${source.authority.toFixed(2)}, relevance=${source.relevance.toFixed(2)}, recency=${source.recency.toFixed(2)})`;
    }),
    "",
    conflicts.length > 0
      ? "## Conflicts and Disagreements"
      : "## Conflicts and Disagreements",
    ...(conflicts.length > 0
      ? conflicts.map((entry) => `- ${entry}`)
      : ["- No direct factual conflicts detected in selected sources."]),
    "",
    "## Uncertainty",
    ...(uncertaintyNotes.length > 0
      ? uncertaintyNotes.map((entry) => `- ${entry}`)
      : ["- No major uncertainty flags beyond normal source limitations."]),
    "",
    "## Citations",
    ...citations.map((citation) => {
      const publisher = citation.publisher ? `${citation.publisher}. ` : "";
      const published = citation.published_date
        ? ` Published ${citation.published_date}.`
        : "";
      return `- [${citation.id}] ${publisher}[${citation.title}](${citation.url}).${published} Accessed ${citation.accessed_at}.`;
    }),
  ].join("\n");

  const whatChangedRecently =
    typeof input.recency_days === "number"
      ? [
          "### What changed recently",
          ...selected
            .filter((source) => source.published_date || source.detected_date)
            .slice(0, 5)
            .map((source, index) => {
              const date = source.published_date ?? source.detected_date;
              const citation = citations[index]?.id ?? `S${index + 1}`;
              return `- ${date}: ${source.title} (${citation})`;
            }),
        ].join("\n")
      : undefined;

  const trace: ResearchTrace = {
    plan: {
      objective: plan.objective,
      scope_boundaries: plan.scope_boundaries,
      key_questions: plan.key_questions,
      success_criteria: plan.success_criteria,
      steps: plan.steps,
    },
    queries,
    chosen_sources: selected.map((source) => ({
      url: source.url,
      title: source.title,
      score: source.final,
      breakdown: {
        authority: source.authority,
        relevance: source.relevance,
        recency: source.recency,
        redundancy: source.redundancy,
      },
    })),
    scoring: selected.map((source) => ({
      url: source.url,
      title: source.title,
      authority: source.authority,
      relevance: source.relevance,
      recency: source.recency,
      redundancy: source.redundancy,
      final: source.final,
    })),
    tool_call_log: callLog,
    conflicts,
    uncertainty_notes: uncertaintyNotes,
  };

  const db = context.supabase as any;

  const { data: reportRow, error: reportError } = await db
    .from("research_reports")
    .insert({
      workspace_id: context.workspaceId,
      project_id: context.projectId,
      conversation_id: context.conversationId,
      message_id: context.messageId,
      created_by: context.userId,
      topic: input.topic,
      goals: input.goals ?? [],
      constraints: input.constraints ?? [],
      audience: input.audience ?? null,
      recency_days: input.recency_days ?? null,
      max_sources: maxSources,
      depth_level: input.depth_level ?? "standard",
      objective: plan.objective,
      scope_boundaries: plan.scope_boundaries,
      key_questions: plan.key_questions,
      success_criteria: plan.success_criteria,
      report_markdown: reportMarkdown,
      what_changed_recently: whatChangedRecently ?? null,
      citations,
    })
    .select("id")
    .single();

  if (reportError || !reportRow?.id) {
    throw new Error(
      `Failed to persist research report: ${reportError?.message ?? "unknown"}`,
    );
  }

  const reportId = reportRow.id as string;

  const sourceRows = selected.map((source, index) => ({
    report_id: reportId,
    workspace_id: context.workspaceId,
    project_id: context.projectId,
    citation_id: citations[index]?.id ?? `S${index + 1}`,
    url: source.url,
    title: source.title,
    publisher:
      typeof source.metadata.publisher === "string"
        ? source.metadata.publisher
        : null,
    published_date: source.published_date ?? source.detected_date ?? null,
    accessed_at: startedAt,
    content_hash: source.content_hash,
    extracted_text_ref: `web_pages_cache:${source.content_hash}`,
    authority_score: source.authority,
    relevance_score: source.relevance,
    recency_score: source.recency,
    redundancy_score: source.redundancy,
    final_score: source.final,
    metadata: source.metadata,
  }));

  const { error: sourcesError } = await db
    .from("research_sources")
    .insert(sourceRows);

  if (sourcesError) {
    throw new Error(
      `Failed to persist research sources: ${sourcesError.message}`,
    );
  }

  const { error: traceError } = await db.from("research_traces").insert({
    report_id: reportId,
    workspace_id: context.workspaceId,
    project_id: context.projectId,
    plan: trace.plan,
    queries: trace.queries,
    selected_sources: trace.chosen_sources,
    scoring: trace.scoring,
    tool_call_log: trace.tool_call_log,
    conflicts: trace.conflicts,
    uncertainty_notes: trace.uncertainty_notes,
  });

  if (traceError) {
    throw new Error(`Failed to persist research trace: ${traceError.message}`);
  }

  return {
    report_markdown: reportMarkdown,
    citations,
    source_bundle: sourceBundle,
    research_trace: trace,
    report_id: reportId,
    what_changed_recently: whatChangedRecently,
  };
}
