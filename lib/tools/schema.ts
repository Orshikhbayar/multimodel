import Ajv from "ajv";

import type { JsonSchema } from "@/lib/tools/types";

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  validateSchema: true,
  removeAdditional: false,
  useDefaults: false,
  allowUnionTypes: true,
});

const validatorCache = new Map<string, ReturnType<typeof ajv.compile>>();

function getSchemaCacheKey(schema: JsonSchema): string {
  return JSON.stringify(schema);
}

export function validateAgainstSchema(
  schema: JsonSchema,
  data: unknown,
): { valid: boolean; errors: string[] } {
  const key = getSchemaCacheKey(schema);
  const cached = validatorCache.get(key);
  const validate = cached ?? ajv.compile(schema);

  if (!cached) {
    validatorCache.set(key, validate);
  }

  const valid = Boolean(validate(data));

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((error) => {
    const at = error.instancePath || "/";
    return `${at}: ${error.message ?? "schema violation"}`;
  });

  return {
    valid: false,
    errors,
  };
}

export function assertValidSchema(schema: JsonSchema): void {
  if (!ajv.validateSchema(schema)) {
    const message = (ajv.errors ?? [])
      .map((error) => `${error.instancePath || "/"}: ${error.message}`)
      .join("; ");
    throw new Error(`Invalid JSON schema: ${message}`);
  }
}
