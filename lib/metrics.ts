/**
 * Metrics collection utility
 * 
 * Provides lightweight metrics collection for monitoring.
 * In production, these could be sent to a metrics service like Datadog or Prometheus.
 * 
 * For now, metrics are logged and can be aggregated by log analysis tools.
 */

import logger from "./logger";

// ============================================
// Types
// ============================================

export interface MetricTags {
  [key: string]: string | number | boolean;
}

export interface TimingMetric {
  name: string;
  durationMs: number;
  tags?: MetricTags;
}

export interface CounterMetric {
  name: string;
  value?: number;
  tags?: MetricTags;
}

export interface GaugeMetric {
  name: string;
  value: number;
  tags?: MetricTags;
}

// ============================================
// In-Memory Metrics Store (for aggregation)
// ============================================

interface MetricBucket {
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[]; // For percentile calculation
}

const metricsBuckets = new Map<string, MetricBucket>();
const BUCKET_SIZE = 100; // Keep last N values for percentile calculation
const FLUSH_INTERVAL_MS = 60_000; // Log aggregated metrics every minute

// Bucket key includes tags for grouping
function getBucketKey(name: string, tags?: MetricTags): string {
  if (!tags || Object.keys(tags).length === 0) {
    return name;
  }
  const tagStr = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${tagStr}}`;
}

function getOrCreateBucket(key: string): MetricBucket {
  let bucket = metricsBuckets.get(key);
  if (!bucket) {
    bucket = { count: 0, sum: 0, min: Infinity, max: -Infinity, values: [] };
    metricsBuckets.set(key, bucket);
  }
  return bucket;
}

function addToBucket(key: string, value: number): void {
  const bucket = getOrCreateBucket(key);
  bucket.count++;
  bucket.sum += value;
  bucket.min = Math.min(bucket.min, value);
  bucket.max = Math.max(bucket.max, value);
  
  // Keep only last N values for percentile calculation
  bucket.values.push(value);
  if (bucket.values.length > BUCKET_SIZE) {
    bucket.values.shift();
  }
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ============================================
// Public API
// ============================================

/**
 * Record a timing metric (e.g., request latency)
 */
export function timing(name: string, durationMs: number, tags?: MetricTags): void {
  const key = getBucketKey(name, tags);
  addToBucket(key, durationMs);
  
  // Log individual timing in development
  if (process.env.NODE_ENV === "development") {
    logger.debug(`[Metric] ${name}`, { durationMs, ...tags });
  }
}

/**
 * Increment a counter (e.g., request count, error count)
 */
export function increment(name: string, value: number = 1, tags?: MetricTags): void {
  const key = getBucketKey(name, tags);
  addToBucket(key, value);
  
  if (process.env.NODE_ENV === "development") {
    logger.debug(`[Metric] ${name}`, { value, ...tags });
  }
}

/**
 * Record a gauge value (e.g., active connections, queue size)
 */
export function gauge(name: string, value: number, tags?: MetricTags): void {
  const key = getBucketKey(name, tags);
  const bucket = getOrCreateBucket(key);
  // For gauges, we only care about the latest value
  bucket.values = [value];
  bucket.count = 1;
  bucket.sum = value;
  bucket.min = value;
  bucket.max = value;
  
  if (process.env.NODE_ENV === "development") {
    logger.debug(`[Metric] ${name}`, { value, ...tags });
  }
}

/**
 * Get aggregated metrics summary
 */
export function getMetricsSummary(): Record<string, {
  count: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}> {
  const summary: Record<string, {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  }> = {};
  
  for (const [key, bucket] of metricsBuckets) {
    if (bucket.count === 0) continue;
    
    summary[key] = {
      count: bucket.count,
      avg: bucket.sum / bucket.count,
      min: bucket.min === Infinity ? 0 : bucket.min,
      max: bucket.max === -Infinity ? 0 : bucket.max,
      p50: calculatePercentile(bucket.values, 50),
      p95: calculatePercentile(bucket.values, 95),
      p99: calculatePercentile(bucket.values, 99),
    };
  }
  
  return summary;
}

/**
 * Reset all metrics (useful for testing or after flush)
 */
export function resetMetrics(): void {
  metricsBuckets.clear();
}

/**
 * Log aggregated metrics summary
 * Called periodically to output metrics for log aggregation
 */
export function flushMetrics(): void {
  const summary = getMetricsSummary();
  
  if (Object.keys(summary).length === 0) return;
  
  logger.info("[Metrics] Periodic summary", { metrics: summary });
  
  // Reset after flush (comment out if you want cumulative metrics)
  // resetMetrics();
}

// ============================================
// Predefined Metrics
// ============================================

export const Metrics = {
  // API metrics
  apiRequestDuration: (durationMs: number, tags: { endpoint: string; status: number; model?: string }) =>
    timing("api.request.duration", durationMs, tags),
  
  apiRequestCount: (tags: { endpoint: string; status: number }) =>
    increment("api.request.count", 1, tags),
  
  apiError: (tags: { endpoint: string; errorType: string }) =>
    increment("api.error.count", 1, tags),
  
  // Stream metrics
  streamDuration: (durationMs: number, tags: { model: string; status: string }) =>
    timing("stream.duration", durationMs, tags),
  
  streamTokens: (tokens: number, tags: { model: string; type: "prompt" | "completion" }) =>
    increment("stream.tokens", tokens, tags),
  
  activeStreams: (count: number) =>
    gauge("stream.active", count),
  
  // Usage metrics
  tokenUsage: (tokens: number, tags: { model: string; userId: string }) =>
    increment("usage.tokens", tokens, tags),
  
  costIncurred: (costUsd: number, tags: { model: string }) =>
    increment("usage.cost_usd", costUsd * 100, tags), // Store as cents for precision
  
  // Rate limiting metrics
  rateLimitHit: (tags: { userId: string; type: "rate" | "concurrency" | "quota" }) =>
    increment("ratelimit.hit", 1, tags),
  
  // Auth metrics
  authSuccess: (tags: { provider: string }) =>
    increment("auth.success", 1, tags),
  
  authFailure: (tags: { provider: string; reason: string }) =>
    increment("auth.failure", 1, tags),
};

// ============================================
// Auto-flush in production
// ============================================

if (typeof globalThis !== "undefined" && process.env.NODE_ENV === "production") {
  // Flush metrics every minute in production
  setInterval(flushMetrics, FLUSH_INTERVAL_MS);
}

export default Metrics;
