/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import {
  computeNextWeeklyRunAt,
  isValidTimezone,
  type WeeklyScheduleConfig,
} from "@/lib/autopilot/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function buildScheduleConfig(
  body: Record<string, unknown>,
): WeeklyScheduleConfig {
  return {
    timezone:
      typeof body.timezone === "string" && body.timezone.trim().length > 0
        ? body.timezone.trim()
        : "UTC",
    weekday: Math.max(0, Math.min(6, readNumber(body.weekday, 1))),
    hour: Math.max(0, Math.min(23, readNumber(body.hour, 9))),
    minute: Math.max(0, Math.min(59, readNumber(body.minute, 0))),
  };
}

export async function GET(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  const workspaceId = request.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) {
    return json({ error: "workspace_id is required", requestId }, 400);
  }

  const { data: schedules, error: scheduleError } = await db
    .from("autopilot_schedules")
    .select(
      "id,workspace_id,created_by,workflow_pack_id,name,template_id,prompt_override,input_snapshot,timezone,weekday,hour,minute,status,next_run_at,last_run_at,max_retries,created_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (scheduleError) {
    return json({ error: scheduleError.message, requestId }, 500);
  }

  const { data: runs, error: runError } = await db
    .from("autopilot_runs")
    .select(
      "id,schedule_id,workspace_id,idempotency_key,scheduled_for,status,attempt_count,started_at,finished_at,asset_template_id,summary_md,error_code,error_message,created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (runError) {
    return json({ error: runError.message, requestId }, 500);
  }

  return json({
    requestId,
    schedules: schedules ?? [],
    runs: runs ?? [],
  });
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body", requestId }, 400);
  }

  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  const workflowPackId =
    typeof body.workflowPackId === "string" ? body.workflowPackId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const templateId =
    typeof body.templateId === "string" && body.templateId.trim().length > 0
      ? body.templateId.trim()
      : null;
  const promptOverride =
    typeof body.promptOverride === "string" &&
    body.promptOverride.trim().length > 0
      ? body.promptOverride.trim()
      : null;
  const inputSnapshot =
    body.inputSnapshot && typeof body.inputSnapshot === "object"
      ? body.inputSnapshot
      : {};
  const status =
    body.status === "paused" || body.status === "disabled"
      ? body.status
      : "active";
  const schedule = buildScheduleConfig(body);

  if (!workspaceId) {
    return json({ error: "workspaceId is required", requestId }, 400);
  }
  if (!workflowPackId) {
    return json({ error: "workflowPackId is required", requestId }, 400);
  }
  if (!name) {
    return json({ error: "name is required", requestId }, 400);
  }
  if (!isValidTimezone(schedule.timezone)) {
    return json({ error: "Invalid timezone", requestId }, 400);
  }

  if (status === "active") {
    const { count, error: countError } = await db
      .from("autopilot_schedules")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active");

    if (countError) {
      return json({ error: countError.message, requestId }, 500);
    }
    if ((count ?? 0) >= 3) {
      return json(
        {
          error: "MVP limit reached: maximum 3 active schedules per workspace",
          requestId,
        },
        400,
      );
    }
  }

  const nextRunAt = computeNextWeeklyRunAt(schedule, new Date()).toISOString();
  const nowIso = new Date().toISOString();
  const { data: created, error: insertError } = await db
    .from("autopilot_schedules")
    .insert({
      workspace_id: workspaceId,
      created_by: claims.sub,
      workflow_pack_id: workflowPackId,
      name,
      template_id: templateId,
      prompt_override: promptOverride,
      input_snapshot: inputSnapshot,
      timezone: schedule.timezone,
      weekday: schedule.weekday,
      hour: schedule.hour,
      minute: schedule.minute,
      status,
      next_run_at: nextRunAt,
      max_retries: Math.max(0, Math.min(5, readNumber(body.maxRetries, 2))),
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(
      "id,workspace_id,created_by,workflow_pack_id,name,template_id,prompt_override,input_snapshot,timezone,weekday,hour,minute,status,next_run_at,last_run_at,max_retries,created_at,updated_at",
    )
    .single();

  if (insertError) {
    return json({ error: insertError.message, requestId }, 500);
  }

  return json({ requestId, schedule: created }, 201);
}
