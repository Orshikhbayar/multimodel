import { NextRequest } from "next/server";
import { nanoid } from "nanoid";

import { createRequestLogger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/tools/context";
import {
  executeToolRequest,
  ToolExecutionError,
} from "@/lib/tools/executor";
import type { ToolExecutionRequest } from "@/lib/tools/types";

interface ExecutePayload extends ToolExecutionRequest {
  tool_name: string;
  input: unknown;
}

function readEmail(claims: Record<string, unknown> | undefined): string | null {
  if (!claims) return null;
  const value =
    typeof claims.email === "string"
      ? claims.email
      : typeof claims["email"] === "string"
        ? (claims["email"] as string)
        : null;

  return value;
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;

  if (!claims?.sub || typeof claims.sub !== "string") {
    return new Response(
      JSON.stringify({
        error: "Authentication required",
        requestId,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  const log = createRequestLogger(requestId, claims.sub);

  try {
    const payload = (await request.json()) as ExecutePayload;

    if (!payload?.tool_name || typeof payload.tool_name !== "string") {
      return new Response(
        JSON.stringify({
          error: "tool_name is required",
          requestId,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const projectId =
      payload.project_id === undefined ? null : (payload.project_id ?? null);

    const workspaceId = await resolveWorkspaceId(supabase, claims.sub, projectId);

    const context = {
      requestId,
      userId: claims.sub,
      userEmail: readEmail(claims),
      workspaceId,
      projectId,
      conversationId: payload.conversation_id ?? null,
      messageId: payload.message_id ?? null,
      supabase,
    };

    const result = await executeToolRequest(context, {
      tool_name: payload.tool_name,
      tool_version: payload.tool_version,
      input: payload.input,
      idempotency_key: payload.idempotency_key,
      require_confirmation: payload.require_confirmation,
      confirmation_token: payload.confirmation_token,
      project_id: projectId,
      conversation_id: payload.conversation_id ?? null,
      message_id: payload.message_id ?? null,
    });

    return new Response(
      JSON.stringify({
        requestId,
        ...result,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      log.warn("Tool execution rejected", {
        code: error.code,
        message: error.message,
      });

      return new Response(
        JSON.stringify({
          error: error.message,
          code: error.code,
          details: error.details ?? undefined,
          requestId,
        }),
        {
          status: error.statusCode,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const message = error instanceof Error ? error.message : String(error);

    log.error("Tool execution failed", error, {
      message,
    });

    return new Response(
      JSON.stringify({
        error: message,
        code: "INTERNAL_ERROR",
        requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
