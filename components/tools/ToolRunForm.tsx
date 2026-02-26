"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmWriteModal } from "@/components/tools/ConfirmWriteModal";
import { ToolRunResult } from "@/components/tools/ToolRunResult";
import type {
  JsonSchemaNode,
  ToolConfirmationChallenge,
  ToolExecuteError,
  ToolExecuteSuccess,
  ToolRegistryEntry,
} from "@/components/tools/types";
import {
  isPlainObject,
  isToolWriteAction,
  schemaTypeIncludes,
  truncateJson,
} from "@/components/tools/utils";

interface ToolRunFormProps {
  tool: ToolRegistryEntry;
  projectId?: string | null;
  conversationId?: string;
  messageId?: string;
  seedInput?: unknown;
  seedToolVersion?: string;
  attachDisabled?: boolean;
  attaching?: boolean;
  onRunCompleted?: (result: ToolExecuteSuccess) => void;
  onAttachRun?: (runId: string) => void;
  onRefreshRuns?: () => void;
}

interface RawEditorState {
  text: string;
  error?: string;
}

function pathKey(path: string[]): string {
  return path.join(".");
}

function getPathValue(root: unknown, path: string[]): unknown {
  let current = root;

  for (const key of path) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function setPathValue(root: unknown, path: string[], nextValue: unknown): unknown {
  if (path.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = path;
  const source = isPlainObject(root) ? root : {};

  return {
    ...source,
    [head]: setPathValue(source[head], tail, nextValue),
  };
}

function deletePathValue(root: unknown, path: string[]): unknown {
  if (path.length === 0) return root;

  if (!isPlainObject(root)) return root;

  const [head, ...tail] = path;

  if (tail.length === 0) {
    const next = { ...root };
    delete next[head];
    return next;
  }

  return {
    ...root,
    [head]: deletePathValue(root[head], tail),
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDefaultInput(schema: JsonSchemaNode): unknown {
  if (schema.default !== undefined) {
    return deepClone(schema.default);
  }

  if (schemaTypeIncludes(schema, "object")) {
    const properties = schema.properties ?? {};
    const entries = Object.entries(properties)
      .map(([key, child]) => [key, buildDefaultInput(child)] as const)
      .filter((entry) => entry[1] !== undefined);

    if (entries.length === 0) {
      return {};
    }

    return Object.fromEntries(entries);
  }

  if (schemaTypeIncludes(schema, "array")) {
    return [];
  }

  return undefined;
}

function isUnsupportedSchemaNode(schema: JsonSchemaNode): boolean {
  return Boolean(schema.anyOf || schema.oneOf || schema.allOf);
}

function sanitizeBySchema(schema: JsonSchemaNode, value: unknown): unknown {
  if (value === undefined) return undefined;

  if (schemaTypeIncludes(schema, "object")) {
    if (!isPlainObject(value)) {
      return {};
    }

    const properties = schema.properties ?? {};
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }
      const sanitized = sanitizeBySchema(child, value[key]);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }

    if (schema.additionalProperties !== false) {
      for (const [key, child] of Object.entries(value)) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
        result[key] = child;
      }
    }

    return result;
  }

  if (schemaTypeIncludes(schema, "array")) {
    if (!Array.isArray(value)) return [];
    if (schema.items) {
      return value.map((item) => sanitizeBySchema(schema.items as JsonSchemaNode, item));
    }
    return value;
  }

  return value;
}

function validateBySchema(
  schema: JsonSchemaNode,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: value must be one of ${schema.enum.join(", ")}`);
    return;
  }

  if (schemaTypeIncludes(schema, "string")) {
    if (typeof value !== "string") {
      errors.push(`${path}: expected string`);
      return;
    }

    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: minimum length is ${schema.minLength}`);
    }

    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path}: maximum length is ${schema.maxLength}`);
    }

    return;
  }

  if (schemaTypeIncludes(schema, "integer") || schemaTypeIncludes(schema, "number")) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${path}: expected number`);
      return;
    }

    if (schemaTypeIncludes(schema, "integer") && !Number.isInteger(value)) {
      errors.push(`${path}: expected integer`);
      return;
    }

    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: minimum value is ${schema.minimum}`);
    }

    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: maximum value is ${schema.maximum}`);
    }

    return;
  }

  if (schemaTypeIncludes(schema, "boolean")) {
    if (typeof value !== "boolean") {
      errors.push(`${path}: expected boolean`);
    }
    return;
  }

  if (schemaTypeIncludes(schema, "array")) {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`);
      return;
    }

    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path}: minimum items is ${schema.minItems}`);
    }

    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path}: maximum items is ${schema.maxItems}`);
    }

    if (schema.items) {
      value.forEach((item, index) =>
        validateBySchema(schema.items as JsonSchemaNode, item, `${path}[${index}]`, errors),
      );
    }

    return;
  }

  if (schemaTypeIncludes(schema, "object")) {
    if (!isPlainObject(value)) {
      errors.push(`${path}: expected object`);
      return;
    }

    const properties = schema.properties ?? {};
    const required = schema.required ?? [];

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) {
        errors.push(`${path}.${key}: required`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${path}.${key}: additional properties are not allowed`);
        }
      }
    }

    for (const [key, child] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      validateBySchema(child, value[key], `${path}.${key}`, errors);
    }
  }
}

function inferWriteTarget(input: unknown): string | null {
  if (!isPlainObject(input)) return null;

  const owner = typeof input.owner === "string" ? input.owner : null;
  const name = typeof input.name === "string" ? input.name : null;
  const branch = typeof input.branch === "string" ? input.branch : null;
  const repoId = typeof input.repo_id === "string" ? input.repo_id : null;

  if (owner && name) {
    return branch ? `${owner}/${name}#${branch}` : `${owner}/${name}`;
  }

  if (repoId) {
    return branch ? `repo ${repoId}#${branch}` : `repo ${repoId}`;
  }

  return null;
}

function numericInputValue(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return String(value);
}

export function ToolRunForm({
  tool,
  projectId,
  conversationId,
  messageId,
  seedInput,
  seedToolVersion,
  attachDisabled = false,
  attaching = false,
  onRunCompleted,
  onAttachRun,
  onRefreshRuns,
}: ToolRunFormProps) {
  const inputSchema = tool.input_schema as JsonSchemaNode;
  const defaultInput = useMemo(() => {
    if (seedInput !== undefined) {
      return deepClone(seedInput);
    }
    return buildDefaultInput(inputSchema) ?? (schemaTypeIncludes(inputSchema, "object") ? {} : undefined);
  }, [inputSchema, seedInput]);

  const [formValue, setFormValue] = useState<unknown>(defaultInput);
  const [toolVersion, setToolVersion] = useState(seedToolVersion ?? tool.tool_version);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [executeError, setExecuteError] = useState<ToolExecuteError | null>(null);
  const [result, setResult] = useState<ToolExecuteSuccess | null>(null);
  const [rawEditors, setRawEditors] = useState<Record<string, RawEditorState>>({});
  const [challenge, setChallenge] = useState<ToolConfirmationChallenge | null>(null);

  useEffect(() => {
    setFormValue(defaultInput);
    setToolVersion(seedToolVersion ?? tool.tool_version);
    setIdempotencyKey("");
    setValidationErrors([]);
    setExecuteError(null);
    setResult(null);
    setRawEditors({});
    setChallenge(null);
  }, [defaultInput, seedToolVersion, tool.tool_name, tool.tool_version]);

  const writeTarget = inferWriteTarget(formValue);

  const updateValue = (path: string[], nextValue: unknown) => {
    setFormValue((current: unknown) => setPathValue(current, path, nextValue));
  };

  const removeValue = (path: string[]) => {
    setFormValue((current: unknown) => deletePathValue(current, path));
  };

  const updateRawEditor = (path: string[], text: string) => {
    const key = pathKey(path);
    const trimmed = text.trim();

    if (!trimmed) {
      setRawEditors((state) => ({
        ...state,
        [key]: {
          text,
          error: undefined,
        },
      }));
      removeValue(path);
      return;
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      setRawEditors((state) => ({
        ...state,
        [key]: {
          text,
          error: undefined,
        },
      }));
      updateValue(path, parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      setRawEditors((state) => ({
        ...state,
        [key]: {
          text,
          error: message,
        },
      }));
    }
  };

  const renderRawEditor = (
    schema: JsonSchemaNode,
    path: string[],
    label: string,
    required: boolean,
  ) => {
    const key = pathKey(path);
    const current = getPathValue(formValue, path);
    const editor = rawEditors[key];

    const fallbackText = (() => {
      if (editor) return editor.text;
      if (current !== undefined) return truncateJson(current, 20_000);
      const fallback = buildDefaultInput(schema);
      if (fallback === undefined) return "";
      return truncateJson(fallback, 20_000);
    })();

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
        <Textarea
          value={fallbackText}
          onChange={(event) => updateRawEditor(path, event.target.value)}
          placeholder='{"key":"value"}'
          className="min-h-[90px] font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          JSON fallback editor used for advanced schema structure.
        </p>
        {editor?.error ? <p className="text-[11px] text-destructive">{editor.error}</p> : null}
      </div>
    );
  };

  const renderField = (
    schema: JsonSchemaNode,
    path: string[],
    label: string,
    required: boolean,
  ) => {
    if (isUnsupportedSchemaNode(schema)) {
      return renderRawEditor(schema, path, label, required);
    }

    const value = getPathValue(formValue, path);

    if (schemaTypeIncludes(schema, "object")) {
      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return renderRawEditor(schema, path, label, required);
      }

      const requiredKeys = new Set(schema.required ?? []);

      return (
        <fieldset className="space-y-2 rounded-lg border border-border/70 p-2.5">
          <legend className="px-1 text-xs font-medium">
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </legend>
          {Object.entries(schema.properties).map(([key, child]) => (
            <div key={`${pathKey(path)}.${key}`}>
              {renderField(
                child,
                [...path, key],
                child.title ?? key,
                requiredKeys.has(key),
              )}
            </div>
          ))}
        </fieldset>
      );
    }

    if (schemaTypeIncludes(schema, "array")) {
      return renderRawEditor(schema, path, label, required);
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      const stringValue = value === undefined || value === null ? "" : String(value);
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </label>
          <select
            value={stringValue}
            onChange={(event) => {
              if (event.target.value === "") {
                removeValue(path);
                return;
              }
              const raw = schema.enum?.find((item) => String(item) === event.target.value);
              updateValue(path, raw ?? event.target.value);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {!required ? <option value="">(unset)</option> : null}
            {schema.enum.map((choice) => (
              <option key={String(choice)} value={String(choice)}>
                {String(choice)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (schemaTypeIncludes(schema, "boolean")) {
      const checked = value === true;
      return (
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => updateValue(path, event.target.checked)}
          />
          <span>
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </span>
        </label>
      );
    }

    if (schemaTypeIncludes(schema, "number") || schemaTypeIncludes(schema, "integer")) {
      const numberValue = numericInputValue(value);
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </label>
          <Input
            type="number"
            step={schemaTypeIncludes(schema, "integer") ? "1" : "any"}
            min={typeof schema.minimum === "number" ? schema.minimum : undefined}
            max={typeof schema.maximum === "number" ? schema.maximum : undefined}
            value={numberValue}
            onChange={(event) => {
              const next = event.target.value;
              if (!next.trim()) {
                removeValue(path);
                return;
              }
              const parsed = Number(next);
              if (Number.isNaN(parsed)) {
                return;
              }
              updateValue(path, schemaTypeIncludes(schema, "integer") ? Math.trunc(parsed) : parsed);
            }}
          />
        </div>
      );
    }

    const stringValue = typeof value === "string" ? value : "";

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
        <Input
          value={stringValue}
          onChange={(event) => updateValue(path, event.target.value)}
          minLength={typeof schema.minLength === "number" ? schema.minLength : undefined}
          maxLength={typeof schema.maxLength === "number" ? schema.maxLength : undefined}
        />
      </div>
    );
  };

  const validateClientInput = (payloadInput: unknown): string[] => {
    const errors: string[] = [];

    for (const [key, editor] of Object.entries(rawEditors)) {
      if (editor.error) {
        errors.push(`${key}: ${editor.error}`);
      }
    }

    if (schemaTypeIncludes(inputSchema, "object") && isPlainObject(payloadInput)) {
      const requiredFields = inputSchema.required ?? [];
      for (const field of requiredFields) {
        if (!Object.prototype.hasOwnProperty.call(payloadInput, field)) {
          errors.push(`$.${field}: required`);
        }
      }
    }

    validateBySchema(inputSchema, payloadInput, "$", errors);
    return errors;
  };

  const execute = async (confirmationToken?: string) => {
    const sanitizedInput = sanitizeBySchema(inputSchema, formValue);
    const errors = validateClientInput(sanitizedInput);

    setValidationErrors(errors);
    setExecuteError(null);

    if (errors.length > 0) {
      return;
    }

    const payload: Record<string, unknown> = {
      tool_name: tool.tool_name,
      input: sanitizedInput,
      project_id: projectId ?? null,
      conversation_id: conversationId ?? null,
      message_id: messageId ?? null,
    };

    if (toolVersion.trim()) {
      payload.tool_version = toolVersion.trim();
    }

    if (idempotencyKey.trim()) {
      payload.idempotency_key = idempotencyKey.trim();
    }

    if (confirmationToken) {
      payload.confirmation_token = confirmationToken;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const errorPayload: ToolExecuteError = {
          requestId: typeof body.requestId === "string" ? body.requestId : undefined,
          error: typeof body.error === "string" ? body.error : "Tool execution failed",
          code: typeof body.code === "string" ? body.code : undefined,
          details: isPlainObject(body.details) ? body.details : undefined,
        };

        if (
          errorPayload.code === "CONFIRMATION_REQUIRED" &&
          errorPayload.details &&
          typeof errorPayload.details.confirmation_token === "string"
        ) {
          setChallenge({
            confirmation_token: errorPayload.details.confirmation_token,
            expires_at:
              typeof errorPayload.details.expires_at === "string"
                ? errorPayload.details.expires_at
                : new Date(Date.now() + 5 * 60_000).toISOString(),
          });
          setExecuteError(null);
          return;
        }

        setExecuteError(errorPayload);
        return;
      }

      const success: ToolExecuteSuccess = {
        requestId: typeof body.requestId === "string" ? body.requestId : "",
        run_id: typeof body.run_id === "string" ? body.run_id : "",
        tool_name: typeof body.tool_name === "string" ? body.tool_name : tool.tool_name,
        tool_version:
          typeof body.tool_version === "string" ? body.tool_version : toolVersion.trim(),
        output: body.output,
        cost: isPlainObject(body.cost)
          ? {
              tokens_in:
                typeof body.cost.tokens_in === "number" ? body.cost.tokens_in : undefined,
              tokens_out:
                typeof body.cost.tokens_out === "number" ? body.cost.tokens_out : undefined,
              total_tokens:
                typeof body.cost.total_tokens === "number"
                  ? body.cost.total_tokens
                  : undefined,
              external_cost_usd:
                typeof body.cost.external_cost_usd === "number"
                  ? body.cost.external_cost_usd
                  : undefined,
            }
          : undefined,
        from_idempotency_cache: body.from_idempotency_cache === true,
      };

      setResult(success);
      setChallenge(null);
      setExecuteError(null);
      onRunCompleted?.(success);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecuteError({
        error: message,
        code: "NETWORK_ERROR",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const objectSchemaFields = useMemo(() => {
    if (!schemaTypeIncludes(inputSchema, "object") || !inputSchema.properties) {
      return [];
    }

    const required = new Set(inputSchema.required ?? []);

    return Object.entries(inputSchema.properties).map(([key, schema]) => ({
      key,
      schema,
      required: required.has(key),
    }));
  }, [inputSchema]);

  const confirmationWarning = useMemo(() => {
    const parts = ["This action can modify external systems or create billable artifacts."];

    if (writeTarget) {
      parts.push(`Target: ${writeTarget}`);
    }

    return parts.join(" ");
  }, [writeTarget]);

  return (
    <div className="space-y-3">
      {isToolWriteAction(tool.requires_confirmation) ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <TriangleAlert className="h-3.5 w-3.5" />
            Write tool requires server confirmation
          </div>
          <p className="mt-1">
            {writeTarget ? `Target: ${writeTarget}. ` : ""}
            Client-side flags cannot bypass confirmation challenges.
          </p>
        </div>
      ) : null}

      {tool.tool_name === "web_fetch" ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          `web_fetch` blocks localhost/private network URLs and enforces size/content safety limits.
        </div>
      ) : null}

      {tool.tool_name === "file_ingest" ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Large files may take longer to parse; verify file type and size before running.
        </div>
      ) : null}

      {objectSchemaFields.length > 0 ? (
        <div className="space-y-3">
          {objectSchemaFields.map((field) => (
            <div key={`${tool.tool_name}.${field.key}`}>
              {renderField(field.schema, [field.key], field.schema.title ?? field.key, field.required)}
            </div>
          ))}
        </div>
      ) : (
        renderRawEditor(inputSchema, [], "input", true)
      )}

      <details className="rounded-lg border border-border/70 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Advanced</summary>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">tool_version</label>
            <Input
              value={toolVersion}
              onChange={(event) => setToolVersion(event.target.value)}
              placeholder={tool.tool_version}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">idempotency_key (optional)</label>
            <Input
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
              placeholder="optional-repeat-safe-key"
            />
          </div>
        </div>
      </details>

      {validationErrors.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="text-xs font-medium text-destructive">Validation errors</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-destructive">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {executeError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">{executeError.error}</p>
          <p className="mt-0.5">
            {executeError.code ? `code: ${executeError.code}` : ""}
            {executeError.requestId ? ` · request: ${executeError.requestId}` : ""}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => execute()} disabled={submitting || confirming}>
          {submitting ? "Running..." : "Run tool"}
        </Button>
        <Badge variant="outline">{tool.tool_name}</Badge>
      </div>

      {result ? (
        <ToolRunResult
          result={result}
          onAttach={onAttachRun}
          attaching={attaching}
          attachDisabled={attachDisabled}
          onRefresh={onRefreshRuns}
        />
      ) : null}

      <ConfirmWriteModal
        open={Boolean(challenge)}
        toolName={tool.tool_name}
        warningText={confirmationWarning}
        expiresAt={challenge?.expires_at}
        loading={confirming}
        onCancel={() => {
          if (confirming) return;
          setChallenge(null);
        }}
        onConfirm={async () => {
          if (!challenge) return;
          setConfirming(true);
          try {
            await execute(challenge.confirmation_token);
          } finally {
            setConfirming(false);
          }
        }}
      />
    </div>
  );
}
