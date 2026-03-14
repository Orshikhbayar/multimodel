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
  source: Record<string, unknown>,
): WeeklyScheduleConfig {
  return {
    timezone:
      typeof source.timezone === "string" && source.timezone.trim().length > 0
        ? source.timezone.trim()
        : "UTC",
    weekday: Math.max(0, Math.min(6, readNumber(source.weekday, 1))),
    hour: Math.max(0, Math.min(23, readNumber(source.hour, 9))),
    minute: Math.max(0, Math.min(59, readNumber(source.minute, 0))),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const requestId = nanoid(10);
  const { scheduleId } = await params;
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

  const { data: existing, error: readError } = await db
    .from("autopilot_schedules")
    .select(
      "id,workspace_id,created_by,workflow_pack_id,name,template_id,prompt_override,input_snapshot,timezone,weekday,hour,minute,status,next_run_at,last_run_at,max_retries,created_at,updated_at",
    )
    .eq("id", scheduleId)
    .maybeSingle();

  if (readError) {
    return json({ error: readError.message, requestId }, 500);
  }
  if (!existing) {
    return json({ error: "Schedule not found", requestId }, 404);
  }

  const mergedSchedule = buildScheduleConfig({
    timezone: body.timezone ?? existing.timezone,
    weekday: body.weekday ?? existing.weekday,
    hour: body.hour ?? existing.hour,
    minute: body.minute ?? existing.minute,
  });
  if (!isValidTimezone(mergedSchedule.timezone)) {
    return json({ error: "Invalid timezone", requestId }, 400);
  }

  const status =
    body.status === "active" ||
    body.status === "paused" ||
    body.status === "disabled"
      ? body.status
      : existing.status;
  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : existing.name;
  const workflowPackId =
    typeof body.workflowPackId === "string" &&
    body.workflowPackId.trim().length > 0
      ? body.workflowPackId.trim()
      : existing.workflow_pack_id;
  const templateId =
    typeof body.templateId === "string" && body.templateId.trim().length > 0
      ? body.templateId.trim()
      : body.templateId === null
        ? null
        : existing.template_id;
  const promptOverride =
    typeof body.promptOverride === "string" &&
    body.promptOverride.trim().length > 0
      ? body.promptOverride.trim()
      : body.promptOverride === null
        ? null
        : existing.prompt_override;
  const inputSnapshot =
    body.inputSnapshot && typeof body.inputSnapshot === "object"
      ? body.inputSnapshot
      : existing.input_snapshot;

  if (status === "active" && existing.status !== "active") {
    const { count, error: countError } = await db
      .from("autopilot_schedules")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", existing.workspace_id)
      .eq("status", "active")
      .neq("id", scheduleId);
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

  const nextRunAt =
    status === "active"
      ? computeNextWeeklyRunAt(mergedSchedule, new Date()).toISOString()
      : existing.next_run_at;

  const { data: updated, error: updateError } = await db
    .from("autopilot_schedules")
    .update({
      workflow_pack_id: workflowPackId,
      name,
      template_id: templateId,
      prompt_override: promptOverride,
      input_snapshot: inputSnapshot,
      timezone: mergedSchedule.timezone,
      weekday: mergedSchedule.weekday,
      hour: mergedSchedule.hour,
      minute: mergedSchedule.minute,
      status,
      next_run_at: nextRunAt,
      max_retries: Math.max(
        0,
        Math.min(5, readNumber(body.maxRetries, existing.max_retries)),
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId)
    .select(
      "id,workspace_id,created_by,workflow_pack_id,name,template_id,prompt_override,input_snapshot,timezone,weekday,hour,minute,status,next_run_at,last_run_at,max_retries,created_at,updated_at",
    )
    .single();

  if (updateError) {
    return json({ error: updateError.message, requestId }, 500);
  }

  return json({ requestId, schedule: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const requestId = nanoid(10);
  const { scheduleId } = await params;
  const supabase = await createSupabaseServerClient();
  const db = supabase as any;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return json({ error: "Authentication required", requestId }, 401);
  }

  const { error } = await db
    .from("autopilot_schedules")
    .delete()
    .eq("id", scheduleId);
  if (error) {
    return json({ error: error.message, requestId }, 500);
  }

  return json({ requestId, ok: true });
}
