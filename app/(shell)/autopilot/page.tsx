"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { analytics } from "@/lib/analytics";
import { useWorkspaceStore } from "@/lib/stores";
import { WORKFLOW_PACKS } from "@/lib/workflows/packs";

interface ScheduleRecord {
  id: string;
  workspace_id: string;
  workflow_pack_id: string;
  name: string;
  timezone: string;
  weekday: number;
  hour: number;
  minute: number;
  status: "active" | "paused" | "disabled";
  next_run_at: string;
  last_run_at: string | null;
  max_retries: number;
  updated_at: string;
}

interface RunRecord {
  id: string;
  schedule_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped";
  attempt_count: number;
  created_at: string;
  finished_at: string | null;
  error_code: string | null;
}

interface ScheduleFormState {
  name: string;
  workflowPackId: string;
  weekday: number;
  hour: number;
  minute: number;
  timezone: string;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export default function AutopilotPage() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [form, setForm] = useState<ScheduleFormState>({
    name: "",
    workflowPackId: "importer-solo-seller",
    weekday: 1,
    hour: 9,
    minute: 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  });

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.status === "active"),
    [schedules],
  );

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<{
        schedules: ScheduleRecord[];
        runs: RunRecord[];
      }>(
        `/api/autopilot/schedules?workspace_id=${encodeURIComponent(workspaceId)}`,
      );
      setSchedules(payload.schedules ?? []);
      setRuns(payload.runs ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load autopilot data",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createSchedule = async () => {
    if (!workspaceId) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Schedule name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = await fetchJson<{ schedule: ScheduleRecord }>(
        `/api/autopilot/schedules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            workflowPackId: form.workflowPackId,
            name: trimmedName,
            timezone: form.timezone,
            weekday: form.weekday,
            hour: form.hour,
            minute: form.minute,
            status: "active",
            maxRetries: 2,
          }),
        },
      );
      analytics.track("autopilot_schedule_created", {
        workspace_id: workspaceId,
        schedule_id: payload.schedule.id,
        pack_id: payload.schedule.workflow_pack_id,
        weekday: payload.schedule.weekday,
        hour: payload.schedule.hour,
        timezone: payload.schedule.timezone,
      });
      setForm((current) => ({ ...current, name: "" }));
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create schedule",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateScheduleStatus = async (
    schedule: ScheduleRecord,
    status: ScheduleRecord["status"],
  ) => {
    if (!workspaceId) return;
    try {
      await fetchJson(`/api/autopilot/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (status === "paused") {
        analytics.track("autopilot_schedule_paused", {
          workspace_id: workspaceId,
          schedule_id: schedule.id,
        });
      } else {
        analytics.track("autopilot_schedule_updated", {
          workspace_id: workspaceId,
          schedule_id: schedule.id,
          changed_fields: ["status"],
        });
      }
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    }
  };

  const deleteSchedule = async (schedule: ScheduleRecord) => {
    if (!window.confirm(`Delete schedule "${schedule.name}"?`)) return;
    try {
      await fetchJson(`/api/autopilot/schedules/${schedule.id}`, {
        method: "DELETE",
      });
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete schedule",
      );
    }
  };

  const runNow = async () => {
    if (!workspaceId) return;
    setRunningNow(true);
    setError(null);
    try {
      await fetchJson(`/api/autopilot/run-due`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to execute autopilot run",
      );
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader
          label="Autopilot"
          title="Weekly Autopilot"
          actions={
            <Button onClick={runNow} disabled={runningNow} className="gap-2">
              {runningNow ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Run due schedules now
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Create schedule</CardTitle>
            <CardDescription>
              Weekly schedules only, with a maximum of 3 active schedules per
              workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Schedule name (e.g. Weekly Reorder Review)"
            />
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <select
                value={form.workflowPackId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    workflowPackId: event.target.value,
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {WORKFLOW_PACKS.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.title}
                  </option>
                ))}
              </select>
              <select
                value={form.weekday}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    weekday: Number.parseInt(event.target.value, 10),
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={0}
                max={23}
                value={form.hour}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hour: Number.parseInt(event.target.value || "0", 10),
                  }))
                }
                placeholder="Hour"
              />
              <Input
                type="number"
                min={0}
                max={59}
                value={form.minute}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minute: Number.parseInt(event.target.value || "0", 10),
                  }))
                }
                placeholder="Minute"
              />
              <Input
                value={form.timezone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                placeholder="Timezone (e.g. America/Chicago)"
              />
            </div>
            <div className="flex items-center justify-end">
              <Button
                onClick={createSchedule}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add schedule
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedules</CardTitle>
            <CardDescription>
              Active: {activeSchedules.length}/3 · Total schedules:{" "}
              {schedules.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading schedules...
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {!loading && schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No schedules yet. Create one to start weekly autopilot runs.
              </p>
            ) : null}
            {schedules.map((schedule) => (
              <Card key={schedule.id}>
                <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{schedule.name}</h3>
                      <Badge
                        variant={
                          schedule.status === "active" ? "default" : "secondary"
                        }
                      >
                        {schedule.status}
                      </Badge>
                      <Badge variant="outline">
                        {schedule.workflow_pack_id}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {WEEKDAY_LABELS[schedule.weekday]}{" "}
                      {String(schedule.hour).padStart(2, "0")}:
                      {String(schedule.minute).padStart(2, "0")} (
                      {schedule.timezone})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Next run:{" "}
                      {new Date(schedule.next_run_at).toLocaleString()}{" "}
                      {schedule.last_run_at
                        ? `· Last run: ${new Date(schedule.last_run_at).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {schedule.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateScheduleStatus(schedule, "paused")}
                        className="gap-1.5"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateScheduleStatus(schedule, "active")}
                        className="gap-1.5"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Activate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteSchedule(schedule)}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Recent runs
            </CardTitle>
            <CardDescription>
              Latest autopilot run history and status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.slice(0, 20).map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          run.status === "succeeded"
                            ? "default"
                            : run.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {run.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Attempts: {run.attempt_count}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                      {run.finished_at
                        ? ` -> ${new Date(run.finished_at).toLocaleString()}`
                        : ""}
                      {run.error_code ? ` · ${run.error_code}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </ContentColumn>
    </div>
  );
}
