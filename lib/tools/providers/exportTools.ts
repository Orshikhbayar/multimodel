import { createHash } from "node:crypto";

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";

import type { ToolExecutionContext } from "@/lib/tools/types";

interface CitationInput {
  id?: string;
  title?: string;
  url?: string;
  publisher?: string;
  published_date?: string;
}

interface ExportInput {
  title: string;
  content_markdown: string;
  citations?: CitationInput[];
  style_preset?: string;
}

interface ExportPptxInput {
  title: string;
  outline_or_slides:
    | Array<{
        title: string;
        bullets?: string[];
        speaker_notes?: string;
        image_url?: string;
      }>
    | {
        slides: Array<{
          title: string;
          bullets?: string[];
          speaker_notes?: string;
          image_url?: string;
        }>;
      };
  theme?: string;
  images?: Array<{
    url: string;
    slide_index?: number;
  }>;
  citations?: CitationInput[];
}

interface ExportOutput {
  artifact_id: string;
  storage_path: string;
  mime_type: string;
}

interface SkillRunInput {
  skill_id: string;
  inputs: Record<string, unknown>;
  output_format: string;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^[-*+]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linesFromMarkdown(markdown: string): string[] {
  return stripMarkdown(markdown)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildCitationLines(citations?: CitationInput[]): string[] {
  if (!citations || citations.length === 0) return [];

  return citations.map((citation, index) => {
    const id = citation.id ?? `C${index + 1}`;
    const title = citation.title ?? "Untitled source";
    const url = citation.url ?? "";
    const publisher = citation.publisher ? `${citation.publisher}. ` : "";
    const published = citation.published_date
      ? ` Published ${citation.published_date}.`
      : "";

    return `[${id}] ${publisher}${title}${url ? ` (${url})` : ""}.${published}`;
  });
}

async function uploadArtifact(
  context: ToolExecutionContext,
  artifactType: "docx" | "pdf" | "pptx",
  title: string,
  mimeType: string,
  payload: Buffer,
  metadata: Record<string, unknown>,
  citations?: CitationInput[],
): Promise<ExportOutput> {
  const db = context.supabase as unknown as {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          fileBody: Buffer,
          options: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    from: (table: string) => {
      insert: (value: Record<string, unknown>) => {
        select: (value: string) => {
          single: () => Promise<{
            data: { id?: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 12);
  const storagePath = `${context.workspaceId}/${context.projectId ?? "general"}/${Date.now()}-${safeTitle || "artifact"}-${hash}.${artifactType}`;

  const { error: uploadError } = await db.storage.from("artifacts").upload(
    storagePath,
    payload,
    {
      contentType: mimeType,
      upsert: false,
    },
  );

  if (uploadError) {
    throw new Error(`Artifact upload failed: ${uploadError.message}`);
  }

  const { data: artifactRow, error: insertError } = await db
    .from("artifacts")
    .insert({
      workspace_id: context.workspaceId,
      project_id: context.projectId,
      conversation_id: context.conversationId,
      message_id: context.messageId,
      created_by: context.userId,
      artifact_type: artifactType,
      title,
      mime_type: mimeType,
      storage_path: storagePath,
      byte_size: payload.length,
      metadata,
      citations: citations ?? [],
      cost_estimate: {},
    })
    .select("id")
    .single();

  if (insertError || !artifactRow?.id) {
    throw new Error(`Artifact metadata insert failed: ${insertError?.message ?? "unknown"}`);
  }

  return {
    artifact_id: artifactRow.id,
    storage_path: storagePath,
    mime_type: mimeType,
  };
}

async function exportDocxBuffer(input: ExportInput): Promise<Buffer> {
  const bodyLines = linesFromMarkdown(input.content_markdown);
  const citationLines = buildCitationLines(input.citations);

  const paragraphs = [
    new Paragraph({
      text: input.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 260 },
    }),
    ...bodyLines.map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 24 })],
          spacing: { after: 140 },
        }),
    ),
  ];

  if (citationLines.length > 0) {
    paragraphs.push(
      new Paragraph({
        text: "References",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 200 },
      }),
    );

    for (const line of citationLines) {
      paragraphs.push(
        new Paragraph({
          text: line,
          spacing: { after: 120 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

async function exportPdfBuffer(input: ExportInput): Promise<Buffer> {
  const bodyLines = linesFromMarkdown(input.content_markdown);
  const citationLines = buildCitationLines(input.citations);

  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: 54,
      bottom: 54,
      left: 54,
      right: 54,
    },
  });

  const chunks: Buffer[] = [];

  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error: Error) => reject(error));
  });

  doc.fontSize(22).font("Helvetica-Bold").text(input.title, {
    align: "left",
  });

  doc.moveDown(1);
  doc.fontSize(11).font("Helvetica");

  for (const line of bodyLines) {
    doc.text(line, {
      align: "left",
      lineGap: 4,
    });
    doc.moveDown(0.5);
  }

  if (citationLines.length > 0) {
    doc.addPage();
    doc.fontSize(16).font("Helvetica-Bold").text("References");
    doc.moveDown(0.8);

    doc.fontSize(10).font("Helvetica");
    for (const line of citationLines) {
      doc.text(line, {
        align: "left",
        lineGap: 3,
      });
      doc.moveDown(0.4);
    }
  }

  doc.end();
  return output;
}

async function exportPptxBuffer(input: ExportPptxInput): Promise<Buffer> {
  const slides = Array.isArray(input.outline_or_slides)
    ? input.outline_or_slides
    : input.outline_or_slides.slides;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "MultiModel AI";
  pptx.subject = input.title;
  pptx.title = input.title;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  const titleSlide = pptx.addSlide();
  titleSlide.addText(input.title, {
    x: 0.7,
    y: 1.1,
    w: 11.8,
    h: 1.2,
    fontFace: "Aptos Display",
    fontSize: 35,
    bold: true,
    color: "1F2937",
  });

  titleSlide.addShape(pptx.ShapeType.line, {
    x: 0.7,
    y: 2.35,
    w: 4.0,
    h: 0,
    line: {
      color: "2563EB",
      pt: 2,
    },
  });

  for (const slideSpec of slides) {
    const slide = pptx.addSlide();

    slide.addText(slideSpec.title, {
      x: 0.7,
      y: 0.4,
      w: 12.0,
      h: 0.8,
      fontFace: "Aptos Display",
      bold: true,
      fontSize: 28,
      color: "111827",
    });

    const bulletLines = (slideSpec.bullets ?? []).map((line) => `- ${line}`);

    if (bulletLines.length > 0) {
      slide.addText(bulletLines.join("\n"), {
        x: 0.9,
        y: 1.45,
        w: 7.2,
        h: 4.8,
        fontFace: "Aptos",
        fontSize: 18,
        color: "1F2937",
        breakLine: true,
      });
    }

    if (slideSpec.speaker_notes) {
      slide.addNotes(`Speaker notes:\n${slideSpec.speaker_notes}`);
    }
  }

  if (input.citations?.length) {
    const references = pptx.addSlide();
    references.addText("References", {
      x: 0.7,
      y: 0.4,
      w: 12.0,
      h: 0.8,
      fontFace: "Aptos Display",
      bold: true,
      fontSize: 28,
      color: "111827",
    });

    const citationLines = buildCitationLines(input.citations);

    references.addText(citationLines.join("\n"), {
      x: 0.9,
      y: 1.4,
      w: 11.5,
      h: 5.6,
      fontFace: "Aptos",
      fontSize: 12,
      color: "374151",
      breakLine: true,
    });
  }

  const arrayBuffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}

export async function exportDocxTool(
  context: ToolExecutionContext,
  input: ExportInput,
): Promise<ExportOutput> {
  const buffer = await exportDocxBuffer(input);

  return uploadArtifact(
    context,
    "docx",
    input.title,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
    {
      style_preset: input.style_preset ?? "clean_v1",
    },
    input.citations,
  );
}

export async function exportPdfTool(
  context: ToolExecutionContext,
  input: ExportInput,
): Promise<ExportOutput> {
  const buffer = await exportPdfBuffer(input);

  return uploadArtifact(
    context,
    "pdf",
    input.title,
    "application/pdf",
    buffer,
    {
      style_preset: input.style_preset ?? "clean_v1",
    },
    input.citations,
  );
}

export async function exportPptxTool(
  context: ToolExecutionContext,
  input: ExportPptxInput,
): Promise<ExportOutput> {
  const buffer = await exportPptxBuffer(input);

  return uploadArtifact(
    context,
    "pptx",
    input.title,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer,
    {
      theme: input.theme ?? "clean_v1",
      slide_count: Array.isArray(input.outline_or_slides)
        ? input.outline_or_slides.length
        : input.outline_or_slides.slides.length,
    },
    input.citations,
  );
}

export async function skillRunTool(
  _context: ToolExecutionContext,
  input: SkillRunInput,
): Promise<{
  status: "ok";
  output: unknown;
}> {
  const endpoint = process.env.OPENAI_SKILLS_RUNNER_URL;

  if (!endpoint) {
    throw new Error("OPENAI_SKILLS_RUNNER_URL is not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.OPENAI_SKILLS_RUNNER_KEY
        ? {
            Authorization: `Bearer ${process.env.OPENAI_SKILLS_RUNNER_KEY}`,
          }
        : {}),
    },
    body: JSON.stringify({
      skill_id: input.skill_id,
      inputs: input.inputs,
      output_format: input.output_format,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Skill runner failed (${response.status}): ${body}`);
  }

  const output = await response.json();

  return {
    status: "ok",
    output,
  };
}
