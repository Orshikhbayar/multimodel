import { createHash } from "node:crypto";

import type { ToolExecutionContext } from "@/lib/tools/types";

interface ImageGenerateInput {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  n?: number;
  transparent_background?: boolean;
  style_transfer?: string;
}

interface ImageGenerateOutput {
  images: Array<{
    artifact_id: string;
    storage_path: string;
    mime_type: string;
  }>;
  model: string;
}

interface OpenAIImageData {
  b64_json?: string;
  revised_prompt?: string;
}

export async function imageGenerateTool(
  context: ToolExecutionContext,
  input: ImageGenerateInput,
): Promise<ImageGenerateOutput> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const prompt = input.style_transfer
    ? `${input.prompt}\n\nStyle transfer guidance: ${input.style_transfer}`
    : input.prompt;

  const requestedN = Math.min(4, Math.max(1, input.n ?? 1));

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: input.size ?? "1024x1024",
      n: requestedN,
      background: input.transparent_background ? "transparent" : "opaque",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    data?: OpenAIImageData[];
  };

  const images = payload.data ?? [];

  if (images.length === 0) {
    throw new Error("Image provider returned no images");
  }

  const db = context.supabase as unknown as {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          payload: Buffer,
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

  const outputs: Array<{
    artifact_id: string;
    storage_path: string;
    mime_type: string;
  }> = [];

  for (const [index, image] of images.entries()) {
    if (!image.b64_json) continue;

    const content = Buffer.from(image.b64_json, "base64");
    const digest = createHash("sha256").update(content).digest("hex").slice(0, 12);

    const storagePath = `${context.workspaceId}/${context.projectId ?? "general"}/images/${Date.now()}-${index + 1}-${digest}.png`;

    const { error: uploadError } = await db.storage.from("artifacts").upload(
      storagePath,
      content,
      {
        contentType: "image/png",
        upsert: false,
      },
    );

    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }

    const { data: artifact, error: artifactError } = await db
      .from("artifacts")
      .insert({
        workspace_id: context.workspaceId,
        project_id: context.projectId,
        conversation_id: context.conversationId,
        message_id: context.messageId,
        created_by: context.userId,
        artifact_type: "image",
        title: `Generated image ${index + 1}`,
        mime_type: "image/png",
        storage_path: storagePath,
        byte_size: content.length,
        metadata: {
          prompt,
          revised_prompt: image.revised_prompt ?? null,
          model: "gpt-image-1",
          params: {
            size: input.size ?? "1024x1024",
            n: requestedN,
            transparent_background: Boolean(input.transparent_background),
            style_transfer: input.style_transfer ?? null,
          },
        },
        citations: [],
        cost_estimate: {
          provider: "openai",
          model: "gpt-image-1",
        },
      })
      .select("id")
      .single();

    if (artifactError || !artifact?.id) {
      throw new Error(
        `Image artifact insert failed: ${artifactError?.message ?? "unknown"}`,
      );
    }

    outputs.push({
      artifact_id: artifact.id,
      storage_path: storagePath,
      mime_type: "image/png",
    });
  }

  return {
    images: outputs,
    model: "gpt-image-1",
  };
}
