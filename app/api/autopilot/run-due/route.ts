/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";
import { nanoid } from "nanoid";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  computeIsoWeekKey,
  computeNextWeeklyRunAt,
  getRetryDelayMinutes,
  type WeeklyScheduleConfig,
} from "@/lib/autopilot/time";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseBool(value: string | null) {
  return value === "true" || value === "1";
}

function toScheduleConfig(schedule: any): WeeklyScheduleConfig {
  return {
    timezone: schedule.timezone,
    weekday: Number(schedule.weekday),
    hour: Number(schedule.hour),
    minute: Number(schedule.minute),
  };
}

function buildAutopilotSummary(
  schedule: any,
  weekKey: string,
  sourcePrompt: string | null,
) {
  const snapshot =
    schedule.input_snapshot && typeof schedule.input_snapshot === "object"
      ? schedule.input_snapshot
      : {};

  const snapshotLines = Object.entries(snapshot)
    .slice(0, 8)
    .map(([key, value]) => `- ${key}: ${String(value)}`);

  const actionLinesByPack: Record<string, string[]> = {
    "importer-solo-seller": [
      "Recalculate landed cost and target margin bands.",
      "Confirm reorder quantity against current stock and sales velocity.",
      "Send supplier follow-up with one clear ask and due date.",
    ],
    "online-seller": [
      "Update top 10 FAQ replies with this week's issue patterns.",
      "Prioritize response templates for conversion-critical questions.",
      "Create one escalation checklist for policy exceptions.",
    ],
    "procurement-tender": [
      "Review missing mandatory requirements and assign owners.",
      "Update submission checklist for deadline risk items.",
      "Revise draft sections that score highest in evaluation criteria.",
    ],
  };
  const actions = actionLinesByPack[schedule.workflow_pack_id] ?? [
    "Review key changes from this week.",
    "Prioritize top three actions for the next week.",
    "Assign owners and due dates for each action.",
  ];

  const now = new Date().toISOString();
  const lines = [
    `# Weekly Autopilot Report: ${schedule.name}`,
    "",
    `- Generated at: ${now}`,
    `- Workflow pack: ${schedule.workflow_pack_id}`,
    `- Period key: ${weekKey}`,
    "",
    "## What Happened",
    snapshotLines.length > 0
      ? snapshotLines.join("\n")
      : "- No structured snapshot data provided for this schedule.",
    "",
    "## Prompt Context",
    sourcePrompt && sourcePrompt.trim().length > 0
      ? sourcePrompt.trim()
      : "No prompt override provided. Using schedule defaults.",
    "",
    "## What To Do Next",
    ...actions.map((action, index) => `${index + 1}. ${action}`),
    "",
    "## Suggested Follow-Up",
    "- Save or update one template based on this report to improve next week's run quality.",
  ];

  return lines.join("\n");
}

async function insertProductEvent(
  db: any,
  args: {
    workspaceId: string;
    userId: string | null;
    eventName: string;
    properties: Record<string, unknown>;
  },
) {
  try {
    await db.from("product_events").insert({
      workspace_id: args.workspaceId,
      user_id: args.userId,
      session_id: "autopilot-worker",
      event_name: args.eventName,
      event_version: 1,
      properties: args.properties,
      occurred_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking analytics.
  }
}

export async function POST(request: NextRequest) {
  const requestId = nanoid(10);
  const secret = request.headers.get("x-autopilot-secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const configuredSecret = process.env.AUTOPILOT_RUN_SECRET;
  const usingSecret =
    Boolean(configuredSecret) &&
    (secret === configuredSecret || bearer === configuredSecret);

  const serverClient = usingSecret ? null : await createSupabaseServerClient();
  const adminClient = usingSecret ? createSupabaseAdminClient() : null;
  const supabase = (usingSecret ? adminClient : serverClient)!;
  const db = supabase as any;

  let userId: string | null = null;
  if (!usingSecret) {
    const { data } = await serverClient!.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) {
      return json({ error: "Authentication required", requestId }, 401);
    }
    userId = claims.sub;
  }

  let body: Record<string, unknown> = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  const workspaceId =
    typeof body.workspaceId === "string"
      ? body.workspaceId.trim()
      : (request.nextUrl.searchParams.get("workspace_id")?.trim() ?? "");
  const dryRun =
    (typeof body.dryRun === "boolean" ? body.dryRun : false) ||
    parseBool(request.nextUrl.searchParams.get("dry_run"));
  const now = new Date();
  const nowIso = now.toISOString();
  const staleThresholdIso = new Date(
    now.getTime() - 30 * 60 * 1000,
  ).toISOString();

  let staleRunQuery = db
    .from("autopilot_runs")
    .select("id,schedule_id,workspace_id,attempt_count,started_at")
    .eq("status", "running")
    .lte("started_at", staleThresholdIso);
  if (workspaceId) {
    staleRunQuery = staleRunQuery.eq("workspace_id", workspaceId);
  }

  const { data: staleRuns } = await staleRunQuery;
  for (const staleRun of staleRuns ?? []) {
    await db
      .from("autopilot_runs")
      .update({
        status: "failed",
        finished_at: nowIso,
        error_code: "STALE_RUN_RECOVERY",
        error_message: "Recovered stale running job older than 30 minutes",
      })
      .eq("id", staleRun.id)
      .eq("status", "running");

    await db
      .from("autopilot_schedules")
      .update({
        next_run_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        updated_at: nowIso,
      })
      .eq("id", staleRun.schedule_id);

    await insertProductEvent(db, {
      workspaceId: staleRun.workspace_id,
      userId: userId,
      eventName: "autopilot_run_failed",
      properties: {
        run_id: staleRun.id,
        schedule_id: staleRun.schedule_id,
        attempt_count: staleRun.attempt_count,
        error_code: "STALE_RUN_RECOVERY",
      },
    });
  }

  let scheduleQuery = db
    .from("autopilot_schedules")
    .select(
      "id,workspace_id,created_by,workflow_pack_id,name,template_id,prompt_override,input_snapshot,timezone,weekday,hour,minute,status,next_run_at,last_run_at,max_retries,created_at,updated_at",
    )
    .eq("status", "active")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(50);

  if (workspaceId) {
    scheduleQuery = scheduleQuery.eq("workspace_id", workspaceId);
  }

  const { data: schedules, error: scheduleError } = await scheduleQuery;
  if (scheduleError) {
    return json({ error: scheduleError.message, requestId }, 500);
  }

  const results: Array<{
    schedule_id: string;
    run_id?: string;
    status: string;
    reason?: string;
  }> = [];

  for (const schedule of schedules ?? []) {
    const actorUserId = userId ?? schedule.created_by ?? null;
    const weekKey = computeIsoWeekKey(now, schedule.timezone);
    const idempotencyKey = `${schedule.id}:${weekKey}`;

    const { data: existingRun, error: existingRunError } = await db
      .from("autopilot_runs")
      .select(
        "id,schedule_id,workspace_id,idempotency_key,scheduled_for,status,attempt_count,started_at,finished_at,error_code,error_message,created_at",
      )
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingRunError) {
      results.push({
        schedule_id: schedule.id,
        status: "error",
        reason: existingRunError.message,
      });
      continue;
    }

    let run = existingRun;
    if (!run) {
      const { data: insertedRun, error: insertError } = await db
        .from("autopilot_runs")
        .insert({
          schedule_id: schedule.id,
          workspace_id: schedule.workspace_id,
          idempotency_key: idempotencyKey,
          scheduled_for: schedule.next_run_at,
          status: "queued",
          attempt_count: 0,
          created_at: nowIso,
        })
        .select(
          "id,schedule_id,workspace_id,idempotency_key,scheduled_for,status,attempt_count,started_at,finished_at,error_code,error_message,created_at",
        )
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          await insertProductEvent(db, {
            workspaceId: schedule.workspace_id,
            userId: actorUserId,
            eventName: "autopilot_run_deduplicated",
            properties: {
              schedule_id: schedule.id,
              idempotency_key: idempotencyKey,
            },
          });
          results.push({
            schedule_id: schedule.id,
            status: "deduplicated",
            reason: "idempotency key already exists",
          });
          continue;
        }

        results.push({
          schedule_id: schedule.id,
          status: "error",
          reason: insertError.message,
        });
        continue;
      }
      run = insertedRun;
      await insertProductEvent(db, {
        workspaceId: schedule.workspace_id,
        userId: actorUserId,
        eventName: "autopilot_run_queued",
        properties: {
          run_id: run.id,
          schedule_id: schedule.id,
          idempotency_key: idempotencyKey,
        },
      });
    } else {
      if (
        run.status === "succeeded" ||
        run.status === "running" ||
        run.status === "queued"
      ) {
        await insertProductEvent(db, {
          workspaceId: schedule.workspace_id,
          userId: actorUserId,
          eventName: "autopilot_run_deduplicated",
          properties: {
            schedule_id: schedule.id,
            idempotency_key: idempotencyKey,
            existing_status: run.status,
          },
        });
        results.push({
          schedule_id: schedule.id,
          run_id: run.id,
          status: "deduplicated",
          reason: `existing run status: ${run.status}`,
        });
        continue;
      }

      if (run.status === "failed") {
        const maxRetries = Number(schedule.max_retries ?? 2);
        const canRetry = Number(run.attempt_count ?? 0) <= maxRetries;
        if (!canRetry) {
          const nextRunAt = computeNextWeeklyRunAt(
            toScheduleConfig(schedule),
            now,
          ).toISOString();
          await db
            .from("autopilot_schedules")
            .update({ next_run_at: nextRunAt, updated_at: nowIso })
            .eq("id", schedule.id);
          results.push({
            schedule_id: schedule.id,
            run_id: run.id,
            status: "skipped",
            reason: "retry limit reached",
          });
          continue;
        }

        const { data: requeuedRun, error: requeueError } = await db
          .from("autopilot_runs")
          .update({
            status: "queued",
            error_code: null,
            error_message: null,
          })
          .eq("id", run.id)
          .eq("status", "failed")
          .select(
            "id,schedule_id,workspace_id,idempotency_key,scheduled_for,status,attempt_count,started_at,finished_at,error_code,error_message,created_at",
          )
          .single();

        if (requeueError) {
          results.push({
            schedule_id: schedule.id,
            run_id: run.id,
            status: "error",
            reason: requeueError.message,
          });
          continue;
        }
        run = requeuedRun;
        await insertProductEvent(db, {
          workspaceId: schedule.workspace_id,
          userId: actorUserId,
          eventName: "autopilot_run_queued",
          properties: {
            run_id: run.id,
            schedule_id: schedule.id,
            idempotency_key: idempotencyKey,
            retry: true,
          },
        });
      }
    }

    const { data: claimedRun, error: claimError } = await db
      .from("autopilot_runs")
      .update({
        status: "running",
        attempt_count: Number(run.attempt_count ?? 0) + 1,
        started_at: nowIso,
        error_code: null,
        error_message: null,
      })
      .eq("id", run.id)
      .eq("status", "queued")
      .select(
        "id,schedule_id,workspace_id,idempotency_key,scheduled_for,status,attempt_count,started_at,finished_at,error_code,error_message,created_at",
      )
      .maybeSingle();

    if (claimError) {
      results.push({
        schedule_id: schedule.id,
        run_id: run.id,
        status: "error",
        reason: claimError.message,
      });
      continue;
    }
    if (!claimedRun) {
      results.push({
        schedule_id: schedule.id,
        run_id: run.id,
        status: "skipped",
        reason: "run already claimed",
      });
      continue;
    }

    await insertProductEvent(db, {
      workspaceId: schedule.workspace_id,
      userId: actorUserId,
      eventName: "autopilot_run_started",
      properties: {
        run_id: claimedRun.id,
        schedule_id: schedule.id,
        attempt_count: claimedRun.attempt_count,
      },
    });

    if (dryRun) {
      await db
        .from("autopilot_runs")
        .update({
          status: "queued",
          started_at: null,
        })
        .eq("id", claimedRun.id);
      results.push({
        schedule_id: schedule.id,
        run_id: claimedRun.id,
        status: "claimed",
        reason: "dry_run",
      });
      continue;
    }

    try {
      let sourcePrompt: string | null = schedule.prompt_override ?? null;
      if (!sourcePrompt && schedule.template_id) {
        const { data: template } = await db
          .from("templates")
          .select("body_md")
          .eq("id", schedule.template_id)
          .maybeSingle();
        sourcePrompt = template?.body_md ?? null;
      }

      const summary = buildAutopilotSummary(schedule, weekKey, sourcePrompt);

      let assetTemplateId: string | null = null;
      const assetTitle = `Autopilot ${schedule.name} ${now.toISOString().slice(0, 10)}`;
      const { data: assetTemplate, error: assetError } = await db
        .from("templates")
        .insert({
          workspace_id: schedule.workspace_id,
          created_by: actorUserId ?? schedule.created_by,
          workflow_pack_id: schedule.workflow_pack_id,
          title: assetTitle,
          description: "Auto-generated weekly autopilot report",
          body_md: summary,
          input_schema: [],
          is_system: false,
        })
        .select("id")
        .maybeSingle();
      if (!assetError && assetTemplate?.id) {
        assetTemplateId = assetTemplate.id;
      }

      const finishedAt = new Date().toISOString();
      const nextRunAt = computeNextWeeklyRunAt(
        toScheduleConfig(schedule),
        new Date(),
      ).toISOString();

      const { error: successError } = await db
        .from("autopilot_runs")
        .update({
          status: "succeeded",
          finished_at: finishedAt,
          summary_md: summary,
          asset_template_id: assetTemplateId,
        })
        .eq("id", claimedRun.id);

      if (successError) {
        throw new Error(successError.message);
      }

      await db
        .from("autopilot_schedules")
        .update({
          last_run_at: finishedAt,
          next_run_at: nextRunAt,
          updated_at: finishedAt,
        })
        .eq("id", schedule.id);

      await insertProductEvent(db, {
        workspaceId: schedule.workspace_id,
        userId: actorUserId,
        eventName: "autopilot_run_succeeded",
        properties: {
          run_id: claimedRun.id,
          schedule_id: schedule.id,
          generated_assets_count: assetTemplateId ? 1 : 0,
        },
      });

      results.push({
        schedule_id: schedule.id,
        run_id: claimedRun.id,
        status: "succeeded",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Autopilot run failed";
      const attempts = Number(claimedRun.attempt_count ?? 0);
      const maxRetries = Number(schedule.max_retries ?? 2);
      const canRetry = attempts <= maxRetries;

      const nextRunAt = canRetry
        ? new Date(
            Date.now() + getRetryDelayMinutes(attempts) * 60_000,
          ).toISOString()
        : computeNextWeeklyRunAt(
            toScheduleConfig(schedule),
            new Date(),
          ).toISOString();

      await db
        .from("autopilot_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_code: "AUTOPILOT_RUN_FAILED",
          error_message: message,
        })
        .eq("id", claimedRun.id);

      await db
        .from("autopilot_schedules")
        .update({
          next_run_at: nextRunAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);

      await insertProductEvent(db, {
        workspaceId: schedule.workspace_id,
        userId: actorUserId,
        eventName: "autopilot_run_failed",
        properties: {
          run_id: claimedRun.id,
          schedule_id: schedule.id,
          attempt_count: attempts,
          error_code: "AUTOPILOT_RUN_FAILED",
        },
      });

      results.push({
        schedule_id: schedule.id,
        run_id: claimedRun.id,
        status: "failed",
        reason: message,
      });
    }
  }

  return json({
    requestId,
    processed: results.length,
    results,
  });
}
