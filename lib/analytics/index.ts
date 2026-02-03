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
  | "logout";

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
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

  constructor() {
    this.enabled = true;
    this.debugMode = process.env.NEXT_PUBLIC_DEBUG === "true";
  }

  /**
   * Track a generic event
   */
  track(event: EventName, properties?: EventProperties): void {
    if (!this.enabled) return;

    const payload = {
      event,
      properties: {
        ...properties,
        timestamp: Date.now(),
      },
    };

    if (this.debugMode) {
      console.log("[Analytics]", payload);
    }

    // TODO: Send to analytics provider
    // e.g., posthog.capture(event, properties);
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
