/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { basename, extname } from "node:path";

import JSZip from "jszip";

import type { ToolExecutionContext } from "@/lib/tools/types";

interface FileIngestInput {
  file_id?: string;
  storage_path?: string;
  options?: {
    bucket?: string;
    file_name?: string;
    file_type?: string;
    enable_ocr?: boolean;
    enable_vision_captioning?: boolean;
  };
}

interface FileIngestOutput {
  file_id: string;
  parsed_text_ref: string;
  metadata: {
    type: string;
    pages?: number;
    word_count: number;
    author?: string;
    created_at?: string;
  };
  content_hash: string;
  chunks_ref: string;
  extraction_warnings: string[];
}

interface FileSearchInput {
  query: string;
  scope?: "project" | "conversation" | "collection";
  top_k?: number;
  filters?: {
    file_type?: string[];
    date_range?: {
      from?: string;
      to?: string;
    };
    file_ids?: string[];
  };
}

interface FileSearchOutput {
  matches: Array<{
    file_id: string;
    chunk_id: string;
    snippet: string;
    score: number;
    page_or_slide?: number;
    section_heading?: string;
    reference: Record<string, unknown>;
  }>;
}

interface TextSegment {
  text: string;
  reference: Record<string, unknown>;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFileType(pathOrName: string, explicit?: string): string {
  if (explicit) {
    return explicit.toLowerCase();
  }

  const extension = extname(pathOrName).toLowerCase().replace(/^\./, "");
  return extension || "txt";
}

function plainTextSegments(text: string): TextSegment[] {
  return [
    {
      text,
      reference: {},
    },
  ];
}

function splitWithReference(
  segments: TextSegment[],
  contentHash: string,
  maxChars = 1200,
): Array<{
  chunk_id: string;
  chunk_index: number;
  chunk_text: string;
  reference: Record<string, unknown>;
  token_count: number;
}> {
  const chunks: Array<{
    chunk_id: string;
    chunk_index: number;
    chunk_text: string;
    reference: Record<string, unknown>;
    token_count: number;
  }> = [];

  let chunkIndex = 0;

  for (const segment of segments) {
    const cleaned = segment.text.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;

    let cursor = 0;
    while (cursor < cleaned.length) {
      const end = Math.min(cleaned.length, cursor + maxChars);
      const slice = cleaned.slice(cursor, end).trim();

      if (slice) {
        const chunkId = hashText(
          `${contentHash}:${chunkIndex}:${JSON.stringify(segment.reference)}:${slice}`,
        ).slice(0, 24);

        chunks.push({
          chunk_id: chunkId,
          chunk_index: chunkIndex,
          chunk_text: slice,
          reference: segment.reference,
          token_count: Math.ceil(slice.length / 4),
        });

        chunkIndex += 1;
      }

      if (end === cleaned.length) break;
      cursor = end - 150;
      if (cursor < 0) cursor = end;
    }
  }

  return chunks;
}

async function parsePdf(buffer: Buffer): Promise<{
  segments: TextSegment[];
  warnings: string[];
  pages?: number;
}> {
  const pdfModule = await import("pdf-parse");
  const pdfParse =
    (pdfModule as unknown as { default?: any }).default ?? pdfModule;
  const parsed = await pdfParse(buffer);
  const rawText = String(parsed.text ?? "");
  const warnings: string[] = [];

  const pageTexts = rawText
    .split("\f")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const segments =
    pageTexts.length > 0
      ? pageTexts.map((text, index) => ({
          text,
          reference: { page: index + 1 },
        }))
      : plainTextSegments(rawText);

  if (rawText.trim().length < 80) {
    warnings.push(
      "PDF text extraction is low-confidence; OCR path is available but not enabled in this environment.",
    );
  }

  return {
    segments,
    warnings,
    pages: parsed.numpages,
  };
}

async function parseDocx(buffer: Buffer): Promise<{
  segments: TextSegment[];
  warnings: string[];
}> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const warnings = [...(result.messages ?? []).map((msg) => msg.message)];

  const paragraphs = result.value
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      text: paragraph,
      reference: { paragraph: index + 1 },
    }));

  return {
    segments: paragraphs.length ? paragraphs : plainTextSegments(result.value),
    warnings,
  };
}

async function parsePptx(buffer: Buffer): Promise<{
  segments: TextSegment[];
  warnings: string[];
  pages?: number;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const segments: TextSegment[] = [];

  for (const [index, slidePath] of slideFiles.entries()) {
    const xml = await zip.file(slidePath)?.async("text");
    if (!xml) continue;

    const chunks = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
      .map((match) => match[1]?.replace(/\s+/g, " ").trim())
      .filter((text): text is string => Boolean(text));

    const slideText = chunks.join(" ").trim();
    if (!slideText) continue;

    segments.push({
      text: slideText,
      reference: { slide: index + 1 },
    });
  }

  return {
    segments: segments.length ? segments : plainTextSegments(""),
    warnings:
      segments.length > 0
        ? []
        : ["No slide text extracted from PPTX. File may be image-only slides."],
    pages: segments.length,
  };
}

async function parseXlsx(buffer: Buffer): Promise<{
  segments: TextSegment[];
  warnings: string[];
}> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const segments: TextSegment[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(
      sheet,
      {
        header: 1,
        blankrows: false,
      },
    );

    rows.forEach((row, index) => {
      const text = row
        .map((value) =>
          value === null || value === undefined ? "" : String(value),
        )
        .join(" | ")
        .trim();

      if (!text) return;

      segments.push({
        text,
        reference: {
          sheet: sheetName,
          row: index + 1,
        },
      });
    });
  }

  return {
    segments,
    warnings: [],
  };
}

function bestEffortDecode(buffer: Buffer): string {
  return buffer.toString("utf8");
}

async function parseFileByType(
  buffer: Buffer,
  fileType: string,
): Promise<{
  text: string;
  segments: TextSegment[];
  warnings: string[];
  metadata: { pages?: number };
}> {
  const normalizedType = fileType.toLowerCase();

  if (["txt", "md", "csv", "json", "tsv"].includes(normalizedType)) {
    const text = bestEffortDecode(buffer);
    return {
      text,
      segments: plainTextSegments(text),
      warnings: [],
      metadata: {},
    };
  }

  if (normalizedType === "pdf") {
    const parsed = await parsePdf(buffer);
    const text = parsed.segments.map((segment) => segment.text).join("\n\n");
    return {
      text,
      segments: parsed.segments,
      warnings: parsed.warnings,
      metadata: {
        pages: parsed.pages,
      },
    };
  }

  if (normalizedType === "docx") {
    const parsed = await parseDocx(buffer);
    return {
      text: parsed.segments.map((segment) => segment.text).join("\n\n"),
      segments: parsed.segments,
      warnings: parsed.warnings,
      metadata: {},
    };
  }

  if (normalizedType === "pptx") {
    const parsed = await parsePptx(buffer);
    return {
      text: parsed.segments.map((segment) => segment.text).join("\n\n"),
      segments: parsed.segments,
      warnings: parsed.warnings,
      metadata: {
        pages: parsed.pages,
      },
    };
  }

  if (normalizedType === "xlsx") {
    const parsed = await parseXlsx(buffer);
    return {
      text: parsed.segments.map((segment) => segment.text).join("\n\n"),
      segments: parsed.segments,
      warnings: parsed.warnings,
      metadata: {},
    };
  }

  if (["png", "jpg", "jpeg", "webp"].includes(normalizedType)) {
    return {
      text: "",
      segments: [],
      warnings: [
        "Image OCR/caption extraction is optional and requires a vision pipeline; currently skipped.",
      ],
      metadata: {},
    };
  }

  const fallback = bestEffortDecode(buffer);
  return {
    text: fallback,
    segments: plainTextSegments(fallback),
    warnings: [
      `Unrecognized file type '${normalizedType}'. Processed as plain text.`,
    ],
    metadata: {},
  };
}

async function resolveFilePayload(
  context: ToolExecutionContext,
  input: FileIngestInput,
): Promise<{
  fileId: string | null;
  storagePath: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  buffer: Buffer;
}> {
  const db = context.supabase as any;

  if (!input.file_id && !input.storage_path) {
    throw new Error("file_id or storage_path is required");
  }

  if (input.file_id) {
    const { data: fileRow, error } = await db
      .from("files")
      .select("id,storage_path,original_name,file_type,mime_type")
      .eq("id", input.file_id)
      .maybeSingle();

    if (error || !fileRow) {
      throw new Error(`File not found: ${error?.message ?? "unknown"}`);
    }

    const bucket = input.options?.bucket ?? "uploads";
    const { data: blob, error: downloadError } = await db.storage
      .from(bucket)
      .download(fileRow.storage_path);

    if (downloadError || !blob) {
      throw new Error(
        `Failed to download file from storage: ${downloadError?.message ?? "unknown"}`,
      );
    }

    const arrayBuffer = await blob.arrayBuffer();

    return {
      fileId: fileRow.id,
      storagePath: fileRow.storage_path,
      fileName: fileRow.original_name,
      fileType: fileRow.file_type,
      mimeType: fileRow.mime_type,
      buffer: Buffer.from(arrayBuffer),
    };
  }

  const storagePath = input.storage_path as string;
  const bucket = input.options?.bucket ?? "uploads";

  const { data: blob, error: downloadError } = await db.storage
    .from(bucket)
    .download(storagePath);

  if (downloadError || !blob) {
    throw new Error(
      `Failed to download storage path '${storagePath}': ${downloadError?.message ?? "unknown"}`,
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const fileName = input.options?.file_name ?? basename(storagePath);
  const fileType = normalizeFileType(fileName, input.options?.file_type);

  return {
    fileId: null,
    storagePath,
    fileName,
    fileType,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(arrayBuffer),
  };
}

function computeSnippet(text: string, queryTerms: string[]): string {
  const lowered = text.toLowerCase();

  for (const term of queryTerms) {
    const index = lowered.indexOf(term);
    if (index >= 0) {
      const start = Math.max(0, index - 80);
      const end = Math.min(text.length, index + term.length + 220);
      return text.slice(start, end).trim();
    }
  }

  return text.slice(0, 260).trim();
}

function keywordScore(text: string, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;

  const lowered = text.toLowerCase();
  let count = 0;

  for (const term of queryTerms) {
    if (lowered.includes(term)) {
      count += 1;
    }
  }

  return count / queryTerms.length;
}

export async function fileIngestTool(
  context: ToolExecutionContext,
  input: FileIngestInput,
): Promise<FileIngestOutput> {
  const resolved = await resolveFilePayload(context, input);
  const parsed = await parseFileByType(resolved.buffer, resolved.fileType);

  const text = parsed.text.trim();
  const contentHash = hashText(text || resolved.buffer.toString("base64"));
  const chunks = splitWithReference(parsed.segments, contentHash);
  const wordCount =
    text.length > 0 ? text.split(/\s+/).filter(Boolean).length : 0;

  const db = context.supabase as any;

  let fileId = resolved.fileId;

  if (fileId) {
    const { data: updated, error } = await db
      .from("files")
      .update({
        content_hash: contentHash,
        parsed_text: text,
        metadata: {
          source: "file_ingest",
          ...parsed.metadata,
        },
        extraction_warnings: parsed.warnings,
        pages: parsed.metadata.pages ?? null,
        word_count: wordCount,
      })
      .eq("id", fileId)
      .select("id")
      .single();

    if (error || !updated?.id) {
      throw new Error(
        `Failed to update file ingest: ${error?.message ?? "unknown"}`,
      );
    }
  } else {
    const { data: inserted, error } = await db
      .from("files")
      .insert({
        workspace_id: context.workspaceId,
        project_id: context.projectId,
        conversation_id: context.conversationId,
        uploaded_by: context.userId,
        storage_path: resolved.storagePath,
        original_name: resolved.fileName,
        file_type: resolved.fileType,
        mime_type: resolved.mimeType,
        size_bytes: resolved.buffer.length,
        content_hash: contentHash,
        parsed_text: text,
        metadata: {
          source: "file_ingest",
          ...parsed.metadata,
        },
        extraction_warnings: parsed.warnings,
        pages: parsed.metadata.pages ?? null,
        word_count: wordCount,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      throw new Error(
        `Failed to create file ingest row: ${error?.message ?? "unknown"}`,
      );
    }

    fileId = inserted.id;
  }

  if (!fileId) {
    throw new Error("File ingest failed to resolve file id");
  }

  const { error: deleteChunksError } = await db
    .from("file_chunks")
    .delete()
    .eq("file_id", fileId);
  if (deleteChunksError) {
    throw new Error(`Failed to clear old chunks: ${deleteChunksError.message}`);
  }

  for (const chunk of chunks) {
    const { error } = await db.from("file_chunks").insert({
      file_id: fileId,
      workspace_id: context.workspaceId,
      project_id: context.projectId,
      chunk_id: chunk.chunk_id,
      chunk_index: chunk.chunk_index,
      chunk_text: chunk.chunk_text,
      reference: chunk.reference,
      token_count: chunk.token_count,
    });

    if (error) {
      throw new Error(`Failed to store file chunk: ${error.message}`);
    }
  }

  return {
    file_id: fileId,
    parsed_text_ref: `files:${fileId}`,
    metadata: {
      type: resolved.fileType,
      pages: parsed.metadata.pages,
      word_count: wordCount,
      created_at: new Date().toISOString(),
    },
    content_hash: contentHash,
    chunks_ref: `file_chunks:file_id=${fileId}`,
    extraction_warnings: parsed.warnings,
  };
}

export async function fileSearchTool(
  context: ToolExecutionContext,
  input: FileSearchInput,
): Promise<FileSearchOutput> {
  const db = context.supabase as any;

  const topK = Math.min(50, Math.max(1, input.top_k ?? 10));
  const scope = input.scope ?? "project";
  const queryTerms = input.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((entry) => entry.length >= 2);

  let chunkQuery = db
    .from("file_chunks")
    .select("file_id,chunk_id,chunk_text,reference,project_id,workspace_id");

  if (scope === "project") {
    chunkQuery = chunkQuery.eq("project_id", context.projectId);
  }

  if (input.filters?.file_ids?.length) {
    chunkQuery = chunkQuery.in("file_id", input.filters.file_ids);
  }

  const { data: chunks, error: chunksError } = await chunkQuery;

  if (chunksError) {
    throw new Error(`Failed to search file chunks: ${chunksError.message}`);
  }

  const fileTypeFilter = new Set(
    (input.filters?.file_type ?? []).map((entry) => entry.toLowerCase()),
  );

  let filesById = new Map<
    string,
    {
      file_type: string;
      created_at: string;
      conversation_id: string | null;
      project_id: string | null;
    }
  >();

  if (chunks && chunks.length > 0) {
    const fileIds = [...new Set(chunks.map((entry: any) => entry.file_id))];
    const { data: files, error: filesError } = await db
      .from("files")
      .select("id,file_type,created_at,conversation_id,project_id")
      .in("id", fileIds);

    if (filesError) {
      throw new Error(`Failed to resolve file metadata: ${filesError.message}`);
    }

    filesById = new Map(
      (files ?? []).map((file: any) => [
        file.id,
        {
          file_type: file.file_type,
          created_at: file.created_at,
          conversation_id: file.conversation_id ?? null,
          project_id: file.project_id ?? null,
        },
      ]),
    );
  }

  const from = input.filters?.date_range?.from
    ? new Date(input.filters.date_range.from)
    : null;
  const to = input.filters?.date_range?.to
    ? new Date(input.filters.date_range.to)
    : null;

  const scored = (chunks ?? [])
    .map((chunk: any) => {
      const meta = filesById.get(chunk.file_id);
      if (!meta) return null;

      if (
        scope === "conversation" &&
        context.conversationId &&
        meta.conversation_id !== context.conversationId
      ) {
        return null;
      }

      if (
        scope === "project" &&
        context.projectId &&
        meta.project_id !== context.projectId
      ) {
        return null;
      }

      if (
        fileTypeFilter.size > 0 &&
        !fileTypeFilter.has(String(meta.file_type).toLowerCase())
      ) {
        return null;
      }

      const created = new Date(meta.created_at);
      if (from && created < from) return null;
      if (to && created > to) return null;

      const score = keywordScore(chunk.chunk_text, queryTerms);
      if (score <= 0) return null;

      return {
        file_id: chunk.file_id,
        chunk_id: chunk.chunk_id,
        snippet: computeSnippet(chunk.chunk_text, queryTerms),
        score,
        reference: (chunk.reference as Record<string, unknown>) ?? {},
      };
    })
    .filter((entry: any): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, topK);

  return {
    matches: scored.map((match: any) => ({
      file_id: match.file_id,
      chunk_id: match.chunk_id,
      snippet: match.snippet,
      score: Number(match.score.toFixed(4)),
      page_or_slide:
        typeof match.reference.page === "number"
          ? (match.reference.page as number)
          : typeof match.reference.slide === "number"
            ? (match.reference.slide as number)
            : undefined,
      section_heading:
        typeof match.reference.sheet === "string"
          ? (match.reference.sheet as string)
          : undefined,
      reference: match.reference,
    })),
  };
}
