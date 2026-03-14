/**
 * Analytics service for usage tracking
 *
 * Provides event tracking abstraction that can be extended to
 * integrate with analytics providers (PostHog, Mixpanel, etc.)
 */

type EventName =
  | "message_sent"
  | "conversation_created"
  | "conversation_deleted"
  | "model_changed"
  | "api_request_started"
  | "api_request_completed"
  | "api_request_failed"
  | "login"
  | "logout"
  | "onboarding_started"
  | "workflow_pack_selected"
  | "guided_input_completed"
  | "first_output_generated"
  | "asset_saved"
  | "template_created"
  | "template_updated"
  | "template_version_restored"
  | "template_favorited"
  | "template_unfavorited"
  | "template_search_performed"
  | "template_applied"
  | "autopilot_schedule_created"
  | "autopilot_schedule_updated"
  | "autopilot_schedule_paused"
  | "autopilot_run_queued"
  | "autopilot_run_started"
  | "autopilot_run_succeeded"
  | "autopilot_run_failed"
  | "autopilot_run_deduplicated"
  | "guardrail_flagged"
  | "safe_template_suggested"
  | "weekly_active_workspace";

type EventPropertyValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | boolean[]
  | Record<string, unknown>;

interface EventProperties {
  [key: string]: EventPropertyValue | undefined;
}

interface ApiUsageMetrics {
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  success: boolean;
}

class AnalyticsService {
  private enabled: boolean;
  private debugMode: boolean;
  private readonly endpoint: string;
  private sessionId: string | null;

  constructor() {
    this.enabled = true;
    this.debugMode = process.env.NEXT_PUBLIC_DEBUG === "true";
    this.endpoint = "/api/events";
    this.sessionId = null;
  }

  private getSessionId(): string {
    if (this.sessionId) return this.sessionId;
    if (typeof window === "undefined") {
      this.sessionId = "server-session";
      return this.sessionId;
    }

    try {
      const existing = window.localStorage.getItem("multi-model-session-id");
      if (existing && existing.trim().length > 0) {
        this.sessionId = existing;
        return this.sessionId;
      }
      const next =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `session-${Date.now()}`;
      window.localStorage.setItem("multi-model-session-id", next);
      this.sessionId = next;
      return this.sessionId;
    } catch {
      this.sessionId = `session-${Date.now()}`;
      return this.sessionId;
    }
  }

  /**
   * Track a generic event
   */
  track(event: EventName, properties?: EventProperties): void {
    if (!this.enabled) return;

    const payload = {
      event,
      properties: {
        event_version: 1,
        source: "web",
        session_id: this.getSessionId(),
        ...properties,
        timestamp: Date.now(),
      },
    };

    if (this.debugMode) {
      console.log("[Analytics]", payload);
    }

    if (typeof window !== "undefined") {
      void fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // Intentionally swallow analytics transport errors.
      });
    }
  }

  /**
   * Track API usage for a model request
   */
  trackApiUsage(metrics: ApiUsageMetrics): void {
    this.track("api_request_completed", {
      model: metrics.model,
      latency_ms: metrics.latencyMs,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      estimated_cost: metrics.estimatedCost,
      success: metrics.success,
    });

    if (this.debugMode) {
      console.log("[Analytics:API]", metrics);
    }
  }

  /**
   * Track message sent event
   */
  trackMessageSent(modelId: string, messageLength: number): void {
    this.track("message_sent", {
      model: modelId,
      message_length: messageLength,
    });
  }

  /**
   * Track model selection change
   */
  trackModelChanged(fromModel: string, toModel: string): void {
    this.track("model_changed", {
      from_model: fromModel,
      to_model: toModel,
    });
  }

  /**
   * Enable or disable analytics
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Singleton instance
export const analytics = new AnalyticsService();
